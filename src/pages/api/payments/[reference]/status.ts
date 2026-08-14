import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../../lib/supabase';
import { checkTokopayOrder, isTokopaySuccessful } from '../../../../lib/tokopay';
import { getDefaultProductPackage, getProductPackages } from '../../../../lib/packages';
import { getProduct } from '../../../../lib/products';
import { sendAccountDeliveryEmail } from '../../../../lib/email';

async function assignAccount(db: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
   const { data: item, error: itemError } = await db.from('order_items').select('product_id,product_name').eq('order_id', orderId).limit(1).maybeSingle();
   if (itemError) throw itemError;
   if (!item) return null;
   const { data: productRecord } = await db.from('products').select('terms').eq('id', item.product_id).maybeSingle();
   const terms = productRecord?.terms ?? '';
   const { data: existing, error: existingError } = await db.from('account_inventory').select('id,login,password,email_sent').eq('assigned_order_id', orderId).eq('status', 'sold').maybeSingle();
   if (existingError) throw existingError;
   if (existing) return { login: existing.login, password: existing.password, terms, _inventoryId: existing.id, _emailSent: existing.email_sent };
   const duration = item.product_name.split(' · ').pop();
   const product = await getProduct(item.product_id);
   const { data: packageRow } = await db.from('product_packages').select('id').eq('product_id', item.product_id).eq('duration', duration).maybeSingle();
   let availableQuery = db.from('account_inventory').select('id').eq('product_id', item.product_id).eq('status', 'available').is('assigned_order_id', null);
   if (packageRow) {
      const packages = product ? await getProductPackages(product) : [];
      const isDefaultPackage = product && getDefaultProductPackage(product, packages)?.id === packageRow.id;
      availableQuery = (isDefaultPackage ? availableQuery.or(`package_id.eq.${packageRow.id},package_id.is.null`) : availableQuery.eq('package_id', packageRow.id)) as typeof availableQuery;
   } else availableQuery = availableQuery.is('package_id', null);
   const { data: available, error: availableError } = await availableQuery.order('created_at', { ascending: true }).limit(1).maybeSingle();
   if (availableError) throw availableError;
   if (!available) return null;
   const { data: claimed, error: claimError } = await db
      .from('account_inventory')
      .update({ status: 'sold', assigned_order_id: orderId, sold_at: new Date().toISOString() })
      .eq('id', available.id)
      .eq('status', 'available')
      .is('assigned_order_id', null)
      .select('id,login,password')
      .maybeSingle();
   if (claimError) throw claimError;
   return claimed ? { login: claimed.login, password: claimed.password, terms, _inventoryId: claimed.id, _emailSent: false } : null;
}

async function triggerEmailDelivery(db: ReturnType<typeof getSupabaseAdmin>, orderId: string, account: { login: string; password?: string; terms?: string; _inventoryId?: string; _emailSent?: boolean } | null) {
   if (!account || !account._inventoryId || account._emailSent) return;
   // Fetch order + customer info
   const { data: order } = await db.from('orders').select('order_number,customer_name,customer_email,order_items(product_name)').eq('id', orderId).maybeSingle();
   if (!order?.customer_email) {
      console.warn('[Email] Tidak ada customer_email untuk order', orderId);
      return;
   }
   const productName = (order.order_items as { product_name: string }[] | null)?.[0]?.product_name ?? 'Produk';
   const result = await sendAccountDeliveryEmail({
      toEmail: order.customer_email,
      customerName: order.customer_name ?? 'Pelanggan',
      orderNumber: order.order_number,
      productName,
      login: account.login,
      password: account.password,
      terms: account.terms,
   });
   if (result.success) {
      await db.from('account_inventory').update({ email_sent: true }).eq('id', account._inventoryId);
      console.info('[Email] Flag email_sent diset untuk inventory', account._inventoryId);
   }
}

export const GET: APIRoute = async ({ params }) => {
   try {
      const db = getSupabaseAdmin();
      const { data, error } = await db.from('payments').select('id,amount,status,qr_string,qr_image_url,order_id,provider_transaction_id,created_at,orders!inner(order_number)').eq('reference_id', params.reference).single();
      if (error || !data) return Response.json({ message: 'Pembayaran tidak ditemukan.' }, { status: 404 });

      const expiresAt = new Date(data.created_at).getTime() + 15 * 60 * 1000;
      if (data.status === 'pending' && Date.now() >= expiresAt) {
         const { error: expirePaymentError } = await db.from('payments').update({ status: 'cancelled', qr_string: null, qr_image_url: null }).eq('id', data.id).eq('status', 'pending');
         if (expirePaymentError) throw expirePaymentError;
         const { error: expireOrderError } = await db.from('orders').update({ status: 'cancelled' }).eq('id', data.order_id).in('status', ['pending', 'processing']);
         if (expireOrderError) throw expireOrderError;
         data.status = 'cancelled';
         data.qr_string = null;
         data.qr_image_url = null;
      }

      if (data.status !== 'paid' && params.reference) {
         const tokopay = await checkTokopayOrder(params.reference);
         if (tokopay && isTokopaySuccessful(tokopay.status)) {
            const transactionId = tokopay.trx_id ?? null;
            const { error: paymentError } = await db.from('payments').update({ status: 'paid', provider_transaction_id: transactionId, paid_at: new Date().toISOString() }).eq('id', data.id).neq('status', 'paid');
            if (paymentError) throw paymentError;
            const { error: orderError } = await db.from('orders').update({ status: 'paid' }).eq('id', data.order_id).neq('status', 'paid');
            if (orderError) throw orderError;
            data.status = 'paid';
         }
      }

      const customerEmail = (data.orders as unknown as { customer_email: string })?.customer_email ?? null;
      const response: Record<string, unknown> = {
         amount: data.amount,
         status: data.status,
         customerEmail,
         qrString: data.status === 'pending' ? data.qr_string : null,
         qrImageUrl: data.status === 'pending' ? data.qr_image_url : null,
         expiresAt: new Date(expiresAt).toISOString(),
      };
      if (data.status === 'paid') {
         const account = await assignAccount(db, data.order_id);
         triggerEmailDelivery(db, data.order_id, account).catch((e) => console.error('[Email] triggerEmailDelivery error:', e));
         response.account = account ? { login: account.login, password: account.password, terms: account.terms } : null;
      }
      return Response.json(response);
   } catch {
      return Response.json({ message: 'Server belum dikonfigurasi.' }, { status: 500 });
   }
};
