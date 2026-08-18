import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../../lib/supabase';
import { isTokopayCancelled, isTokopaySuccessful } from '../../../../lib/tokopay';
import { assignAccount, triggerEmailDelivery, triggerOrderNotifications } from '../../../../lib/order-fulfillment';

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
      const { data: updated, error: updateError } = await db
        .from('payments')
        .update({ status: 'paid', provider_transaction_id: transactionId || null, paid_at: new Date().toISOString() })
        .eq('id', payment.id)
        .neq('status', 'paid')
        .select('id');
      if (updateError) throw updateError;

      if (updated && updated.length > 0) {
        const { error: orderError } = await db.from('orders').update({ status: 'paid' }).eq('id', payment.order_id).neq('status', 'paid');
        if (orderError) throw orderError;
        // Kirim notifikasi WA pesanan baru & alert low stock ke admin
        triggerOrderNotifications(db, payment.order_id, reference).catch((e) => console.error('[WA] triggerOrderNotifications error:', e));
      }

      const webhookAccount = await assignAccount(db, payment.order_id);
      triggerEmailDelivery(db, payment.order_id, webhookAccount).catch((e) => console.error('[Email] triggerEmailDelivery error:', e));

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