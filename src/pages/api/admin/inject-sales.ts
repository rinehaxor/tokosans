import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { ADMIN_ACCESS_COOKIE, getSupabaseAuth } from '../../../lib/admin-auth';
import { getProducts } from '../../../lib/products';

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

const DUMMY_EMAIL = 'dummy@tokosans.local';
const DUMMY_NAMES = [
  'Andi Wijaya','Budi Santoso','Citra Dewi','Dian Purnama','Eka Saputra',
  'Faisal Rahman','Gita Nuraini','Hendra Kusuma','Indah Lestari','Joko Prasetyo',
  'Kartika Sari','Lukman Hakim','Maya Anggraini','Nanda Permata','Omar Farhan',
  'Putri Handayani','Qori Maulana','Rina Marlina','Surya Dharma','Tania Safitri',
  'Umar Hidayat','Vina Oktavia','Wawan Hermawan','Xena Fitriani','Yusuf Ramadhan',
  'Zahra Amelia','Agus Firmansyah','Bunga Cempaka','Cahya Nugraha','Dewi Fortuna',
  'Erwin Pratama','Fitri Rahmawati','Guntur Prabowo','Hana Safira','Irfan Maulidi',
  'Jasmine Putri','Kevin Setiawan','Laras Wulandari','Miftah Ardiansyah','Nabila Azzahra',
];
const pick = () => DUMMY_NAMES[Math.floor(Math.random() * DUMMY_NAMES.length)];
const ts90 = () => new Date(Date.now() - Math.random() * 90 * 864e5).toISOString();
const ref = (pid: string, i: number) => `SEED-${pid}-${i}-${Math.random().toString(36).slice(2, 8)}`;

// POST: Inject dummy sales
export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) return Response.json({ message: 'Tidak diizinkan.' }, { status: 401 });
  try {
    const body = await request.json();
    const productId = body.product_id as string | undefined;
    const count = Math.min(Math.max(Math.round(Number(body.count) || 500), 1), 2000);
    const db = getSupabaseAdmin();
    const allProducts = await getProducts();

    let targets: { id: string; name: string; price: number }[] = [];
    if (productId) {
      const found = allProducts.find(p => p.id === productId);
      if (!found) return Response.json({ message: `Produk "${productId}" tidak ditemukan.` }, { status: 404 });
      targets = [{ id: found.id, name: found.name, price: found.price }];
    } else {
      const active = allProducts.filter(p => p.active !== false);
      if (!active.length) return Response.json({ message: 'Tidak ada produk aktif.' }, { status: 404 });
      targets = active.map(p => ({ id: p.id, name: p.name, price: p.price }));
    }

    let total = 0;
    const BATCH = 200;
    for (const p of targets) {
      for (let s = 0; s < count; s += BATCH) {
        const n = Math.min(BATCH, count - s);
        const rows = Array.from({ length: n }, (_, i) => ({
          order_number: ref(p.id, s + i + 1),
          customer_name: pick(),
          customer_email: DUMMY_EMAIL,
          total_amount: p.price,
          status: 'completed',
          created_at: ts90(),
        }));
        const { data: ins, error: oErr } = await db.from('orders').insert(rows).select('id');
        if (oErr) return Response.json({ message: `Gagal inject: ${oErr.message}`, injected: total }, { status: 500 });
        if (ins?.length) {
          const items = ins.map((o) => ({ order_id: o.id, product_id: p.id, product_name: p.name, price: p.price, quantity: 1 }));
          const { error: iErr } = await db.from('order_items').insert(items);
          if (iErr) return Response.json({ message: `Gagal inject items: ${iErr.message}`, injected: total }, { status: 500 });
          total += ins.length;
        }
      }
    }
    return Response.json({ message: `Berhasil inject ${total.toLocaleString('id-ID')} penjualan untuk ${targets.length} produk.`, injected: total, products: targets.map((p) => p.name) });
  } catch (error) {
    console.error('Inject sales error:', error);
    return Response.json({ message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
};


// DELETE: Remove all dummy seed data
export const DELETE: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) return Response.json({ message: 'Tidak diizinkan.' }, { status: 401 });
  try {
    const db = getSupabaseAdmin();
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_email', DUMMY_EMAIL);
    const { error } = await db.from('orders').delete().eq('customer_email', DUMMY_EMAIL);
    if (error) return Response.json({ message: `Gagal menghapus: ${error.message}` }, { status: 500 });
    return Response.json({ message: `Berhasil menghapus ${(count || 0).toLocaleString('id-ID')} data penjualan dummy.`, deleted: count || 0 });
  } catch (error) {
    console.error('Cleanup error:', error);
    return Response.json({ message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
};

// GET: Stats for dummy data
export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) return Response.json({ message: 'Tidak diizinkan.' }, { status: 401 });
  try {
    const db = getSupabaseAdmin();
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_email', DUMMY_EMAIL);
    return Response.json({ total_dummy_orders: count || 0 });
  } catch (error) {
    console.error('Stats error:', error);
    return Response.json({ message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
};

