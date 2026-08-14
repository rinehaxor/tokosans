import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { ADMIN_ACCESS_COOKIE, getSupabaseAuth } from '../../../lib/admin-auth';

async function isAuthenticated(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )\\s*${ADMIN_ACCESS_COOKIE}=([^;]*)`));
  const token = match ? decodeURIComponent(match[1]) : null;
  if (!token) return false;
  try {
    const { data } = await getSupabaseAuth().auth.getUser(token);
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAuthenticated(request))) {
    return Response.json({ message: 'Tidak diizinkan.' }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();
    const orderId = url.searchParams.get('id');
    const statusFilter = url.searchParams.get('status') || 'all';
    const searchQuery = (url.searchParams.get('q') || '').trim().toLowerCase();

    // Auto-cancel any pending orders/payments older than 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await Promise.all([
      db.from('orders').update({ status: 'cancelled' }).eq('status', 'pending').lt('created_at', fifteenMinsAgo),
      db.from('payments').update({ status: 'cancelled', qr_string: null, qr_image_url: null }).eq('status', 'pending').lt('created_at', fifteenMinsAgo)
    ]).catch((err) => console.error('Error auto-cancelling expired orders:', err));

    // If order ID is requested, fetch single order full details
    if (orderId) {
      const { data: order, error: orderErr } = await db
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) {
        return Response.json({ message: 'Pesanan tidak ditemukan.' }, { status: 404 });
      }

      // Fetch items
      const { data: items } = await db
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      // Fetch payment info
      const { data: payment } = await db
        .from('payments')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      // Fetch assigned account if paid
      let assignedAccount = null;
      if (order.status === 'paid') {
        const { data: account } = await db
          .from('account_inventory')
          .select('id, login, password, sold_at')
          .eq('assigned_order_id', orderId)
          .maybeSingle();
        assignedAccount = account;
      }

      return Response.json({
        order,
        items: items ?? [],
        payment: payment ?? null,
        assignedAccount
      });
    }

    // Otherwise fetch list of orders
    let query = db
      .from('orders')
      .select('id, order_number, customer_name, customer_email, total_amount, status, created_at')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      if (statusFilter === 'cancelled') {
        query = query.in('status', ['cancelled', 'expired']);
      } else {
        query = query.eq('status', statusFilter);
      }
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    let result = orders ?? [];

    if (searchQuery) {
      result = result.filter(
        (o) =>
          o.order_number.toLowerCase().includes(searchQuery) ||
          o.customer_name.toLowerCase().includes(searchQuery) ||
          o.customer_email.toLowerCase().includes(searchQuery)
      );
    }

    return Response.json({ orders: result });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    return Response.json({ message: 'Gagal mengambil data pesanan.' }, { status: 500 });
  }
};
