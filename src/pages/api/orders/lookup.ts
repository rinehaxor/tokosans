import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim();

  if (!query || query.length < 3) {
    return Response.json({ message: 'Masukkan email atau nomor referensi pesanan.' }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // Auto-cancel any pending orders/payments older than 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await Promise.all([
      db.from('orders').update({ status: 'cancelled' }).eq('status', 'pending').lt('created_at', fifteenMinsAgo),
      db.from('payments').update({ status: 'cancelled', qr_string: null, qr_image_url: null }).eq('status', 'pending').lt('created_at', fifteenMinsAgo)
    ]).catch(() => {});

    // Query pembayaran yang cocok dengan reference_id ATAU email customer di tabel orders
    const isReference = query.toUpperCase().startsWith('UG-') || query.includes('-');

    let dbQuery = db
      .from('payments')
      .select(`
        reference_id,
        amount,
        status,
        created_at,
        orders!inner (
          customer_email,
          order_items (
            product_name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (isReference) {
      dbQuery = dbQuery.ilike('reference_id', `%${query}%`);
    } else {
      dbQuery = dbQuery.eq('orders.customer_email', query.toLowerCase());
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error('Order lookup error:', error);
      return Response.json({ message: 'Gagal mengambil data pesanan.' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return Response.json({ orders: [] });
    }

    const orders = data.map((item: any) => {
      const orderItems = item.orders?.order_items;
      const productName = Array.isArray(orderItems) && orderItems.length > 0
        ? orderItems[0].product_name
        : 'Produk Digital';

      return {
        reference: item.reference_id,
        amount: item.amount,
        status: item.status,
        createdAt: item.created_at,
        productName,
      };
    });

    return Response.json({ orders });
  } catch (err) {
    console.error('Order lookup unexpected error:', err);
    return Response.json({ message: 'Terjadi kesalahan sistem.' }, { status: 500 });
  }
};
