import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';

export const ALL: APIRoute = async () => {
  try {
    const db = getSupabaseAdmin();
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [resOrders, resPayments] = await Promise.all([
      db.from('orders').update({ status: 'cancelled' }).eq('status', 'pending').lt('created_at', fifteenMinsAgo).select('id'),
      db.from('payments').update({ status: 'cancelled', qr_string: null, qr_image_url: null }).eq('status', 'pending').lt('created_at', fifteenMinsAgo).select('id')
    ]);

    const updatedCount = resOrders.data?.length ?? 0;
    return Response.json({ success: true, updated: updatedCount, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Cron cleanup error:', error);
    return Response.json({ success: false, message: 'Gagal melakukan pembersihan pesanan.' }, { status: 500 });
  }
};