import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../../lib/supabase';
import { getDefaultProductPackage, getProductPackages } from '../../../../lib/packages';
import { getProduct } from '../../../../lib/products';
import { isTokopayCancelled, isTokopaySuccessful } from '../../../../lib/tokopay';
import { sendAccountDeliveryEmail } from '../../../../lib/email';

async function assignAccount(db: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
  const { data: item, error: itemError } = await db.from('order_items').select('product_id,product_name').eq('order_id', orderId).limit(1).maybeSingle();
  if (itemError) throw itemError;
  if (!item) return null;
  const { data: existing, error: existingError } = await db.from('account_inventory').select('id,login,password,email_sent').eq('assigned_order_id', orderId).eq('status', 'sold').maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { id: existing.id, login: existing.login, password: existing.password, email_sent: existing.email_sent };
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
  const { data: claimed, error: claimError } = await db.from('account_inventory').update({ status: 'sold', assigned_order_id: orderId, sold_at: new Date().toISOString() }).eq('id', available.id).eq('status', 'available').is('assigned_order_id', null).select('id,login,password').maybeSingle();
  if (claimError) throw claimError;
  return claimed ? { id: claimed.id, login: claimed.login, password: claimed.password, email_sent: false } : null;
}

async function triggerEmailDelivery(db: ReturnType<typeof getSupabaseAdmin>, orderId: string, account: { id: string; login: string; password?: string; email_sent?: boolean } | null) {
  if (!account || account.email_sent) return;
  const { data: order } = await db.from('orders').select('order_number,customer_name,customer_email,order_items(product_name)').eq('id', orderId).maybeSingle();
  if (!order?.customer_email) {
    console.warn('[Email] Tidak ada customer_email untuk order', orderId);
    return;
  }
  const { data: productRecord } = await db.from('order_items').select('product_id').eq('order_id', orderId).limit(1).maybeSingle();
  const terms = productRecord?.product_id
    ? (await db.from('products').select('terms').eq('id', productRecord.product_id).maybeSingle()).data?.terms ?? ''
    : '';
  const productName = (order.order_items as { product_name: string }[] | null)?.[0]?.product_name ?? 'Produk';
  const result = await sendAccountDeliveryEmail({
    toEmail: order.customer_email,
    customerName: order.customer_name ?? 'Pelanggan',
    orderNumber: order.order_number,
    productName,
    login: account.login,
    password: account.password,
    terms,
  });
  if (result.success) {
    await db.from('account_inventory').update({ email_sent: true }).eq('id', account.id);
    console.info('[Email] Flag email_sent diset untuk inventory', account.id);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const token = request.headers.get('x-webhook-token') ?? new URL(request.url).searchParams.get('token');
  const configuredToken = import.meta.env.TOKOPAY_WEBHOOK_TOKEN;
  if (!import.meta.env.DEV && (!configuredToken || token !== configuredToken)) return new Response('Unauthorized', { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;
    const reference = String(data.reff_id ?? data.ref_id ?? data.reference_id ?? payload.reff_id ?? payload.ref_id ?? payload.reference_id ?? '');
    const status = data.status ?? payload.status;
    const transactionId = String(data.trx_id ?? data.transaction_id ?? payload.trx_id ?? payload.transaction_id ?? '');
    if (!reference) {
      return new Response('Missing reference', { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: payment, error: paymentError } = await db.from('payments').select('id,order_id,status').eq('reference_id', reference).single();
    if (paymentError || !payment) return new Response('Unknown reference', { status: 404 });

    if (isTokopaySuccessful(status)) {
      if (payment.status !== 'paid') {
        const { error } = await db.from('payments').update({ status: 'paid', provider_transaction_id: transactionId || null, paid_at: new Date().toISOString() }).eq('id', payment.id);
        if (error) throw error;
        const { error: orderError } = await db.from('orders').update({ status: 'paid' }).eq('id', payment.order_id);
        if (orderError) throw orderError;
      }
      const webhookAccount = await assignAccount(db, payment.order_id);
      triggerEmailDelivery(db, payment.order_id, webhookAccount).catch(e => console.error('[Email] triggerEmailDelivery error:', e));
      return new Response('OK', { status: 200 });
    }

    if (isTokopayCancelled(status)) {
      if (payment.status === 'pending') {
        await db.from('payments').update({ status: 'cancelled', qr_string: null, qr_image_url: null }).eq('id', payment.id);
        await db.from('orders').update({ status: 'cancelled' }).eq('id', payment.order_id);
      }
      return new Response('OK', { status: 200 });
    }

    console.info('TokoPay webhook ignored', { reference, status });
    return new Response('Ignored', { status: 200 });
  } catch (error) { console.error(error); return new Response('Invalid callback', { status: 400 }); }
};