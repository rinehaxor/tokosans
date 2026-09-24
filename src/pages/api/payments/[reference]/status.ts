import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../../lib/supabase';
import { assignAccount, triggerEmailDelivery, triggerOrderNotifications } from '../../../../lib/order-fulfillment';
import { checkTokopayOrder, isTokopaySuccessful } from '../../../../lib/tokopay';
import { checkDigiflazzOrder, isDigiflazzSuccessful } from '../../../../lib/digiflazz';
import { processTopupFulfillment } from '../../../../lib/topup';

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
        let provider: 'tokopay' | 'digiflazz' | null = data.provider as 'tokopay' | 'digiflazz' | null;
        if (!provider) {
          provider = 'tokopay';
        }

        if (provider === 'digiflazz') {
          const digiflazz = await checkDigiflazzOrder(params.reference);
          if (digiflazz && isDigiflazzSuccessful(digiflazz.status)) {
            const { data: updated, error: paymentError } = await db
              .from('payments')
              .update({ status: 'paid', provider_transaction_id: digiflazz.sn || null, paid_at: new Date().toISOString() })
              .eq('id', data.id)
              .neq('status', 'paid')
              .select('id');
            if (paymentError) throw paymentError;

            if (updated && updated.length > 0) {
              const { error: orderError } = await db.from('orders').update({ status: 'paid' }).eq('id', data.order_id).neq('status', 'paid');
              if (orderError) throw orderError;
              // Kirim notifikasi WhatsApp penjualan & low stock ke admin
              triggerOrderNotifications(db, data.order_id, params.reference).catch((e) => console.error('[WA] triggerOrderNotifications error:', e));
            }
            data.status = 'paid';
          }
        } else {
          const tokopay = await checkTokopayOrder(params.reference);
          if (tokopay && isTokopaySuccessful(tokopay.status)) {
            const transactionId = tokopay.trx_id ?? null;
            const { data: updated, error: paymentError } = await db
              .from('payments')
              .update({ status: 'paid', provider_transaction_id: transactionId, paid_at: new Date().toISOString() })
              .eq('id', data.id)
              .neq('status', 'paid')
              .select('id');
            if (paymentError) throw paymentError;

            if (updated && updated.length > 0) {
              const { error: orderError } = await db.from('orders').update({ status: 'paid' }).eq('id', data.order_id).neq('status', 'paid');
              if (orderError) throw orderError;
              // Kirim notifikasi WhatsApp penjualan & low stock ke admin
              triggerOrderNotifications(db, data.order_id, params.reference).catch((e) => console.error('[WA] triggerOrderNotifications error:', e));
            }
            data.status = 'paid';
          }
        }
      }

      const customerEmail = (data.orders as unknown as { customer_email: string })?.customer_email ?? null;
      // Forward order top up game (Digiflazz) ke provider jika belum diproses
      const topup = await processTopupFulfillment(db, data.order_id).catch((e) => { console.error('[Topup] error:', e); return null; });
      if (topup?.attempted) console.info('[Topup] hasil (polling):', JSON.stringify(topup));
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