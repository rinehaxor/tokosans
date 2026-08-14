import type { APIRoute } from 'astro';
import { getProduct } from '../../../lib/products';
import { getProductPackages } from '../../../lib/packages';
import { getSupabaseAdmin } from '../../../lib/supabase';

async function syncStock(productId: string) {
  const db = getSupabaseAdmin();
  const { count, error } = await db.from('account_inventory').select('id', { count: 'exact', head: true }).eq('product_id', productId).eq('status', 'available');
  if (error) throw error;
  const { error: syncError } = await db.from('inventory').update({ stock: count ?? 0, updated_at: new Date().toISOString() }).eq('product_id', productId);
  if (syncError) throw syncError;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const db = getSupabaseAdmin();
    let query = db.from('account_inventory').select('id,product_id,login,password,status,assigned_order_id,created_at,sold_at').order('created_at', { ascending: false });
    const productId = url.searchParams.get('productId');
    if (productId && await getProduct(productId)) query = query.eq('product_id', productId);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ accounts: data ?? [] });
  } catch (error) {
    console.error('Accounts GET error:', error);
    return Response.json({ message: 'Stok akun belum tersedia.' }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { productId?: string; packageId?: string; login?: string; password?: string };
    const login = String(body.login ?? '').trim();
    const password = String(body.password ?? '');
    if (!body.productId || !(await getProduct(body.productId)) || !login || !password) return Response.json({ message: 'Produk, login, dan password wajib diisi.' }, { status: 400 });
    const db = getSupabaseAdmin();
    const packageId = body.packageId || body.productId;
    const packages = await getProductPackages(await getProduct(body.productId)!);
    if (packageId !== body.productId && !packages.some((item) => item.id === packageId && item.active)) return Response.json({ message: 'Paket tidak valid untuk produk ini.' }, { status: 400 });
    const { data, error } = await db.from('account_inventory').insert({ product_id: body.productId, package_id: packageId === body.productId ? null : packageId, login, password, status: 'available' }).select('id,product_id,package_id,login,password,status,assigned_order_id,created_at,sold_at').single();
    if (error) throw error;
    await syncStock(body.productId);
    return Response.json({ account: data });
  } catch (error) {
    console.error('Accounts POST error:', error);
    return Response.json({ message: 'Gagal menambahkan akun.' }, { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { id?: string; status?: string; productId?: string; packageId?: string; login?: string; password?: string };
    if (!body.id) return Response.json({ message: 'ID akun wajib diisi.' }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: existingAccount } = await db.from('account_inventory').select('product_id,package_id').eq('id', body.id).maybeSingle();
    const changes: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!['available', 'disabled'].includes(body.status)) return Response.json({ message: 'Data status akun tidak valid.' }, { status: 400 });
      changes.status = body.status;
    }
    if (body.productId !== undefined) {
      if (!(await getProduct(body.productId))) return Response.json({ message: 'Produk tidak ditemukan.' }, { status: 400 });
      changes.product_id = body.productId;
    }
    if (body.packageId !== undefined) {
      const productId = body.productId ?? existingAccount?.product_id;
      if (!productId) return Response.json({ message: 'Produk akun tidak ditemukan.' }, { status: 400 });
      const product = await getProduct(productId);
      const packages = product ? await getProductPackages(product) : [];
      if (body.packageId !== productId && !packages.some((item) => item.id === body.packageId && item.active)) return Response.json({ message: 'Paket tidak valid untuk produk ini.' }, { status: 400 });
      changes.package_id = body.packageId === productId ? null : body.packageId;
    }
    if (body.login !== undefined) changes.login = String(body.login).trim();
    if (body.password !== undefined) changes.password = String(body.password);
    if (!Object.keys(changes).length || ('login' in changes && !changes.login) || ('password' in changes && !changes.password)) return Response.json({ message: 'Data akun tidak valid.' }, { status: 400 });
    let query = db.from('account_inventory').update(changes).eq('id', body.id);
    if (body.status !== undefined) query = query.eq('status', body.status === 'available' ? 'disabled' : 'available');
    const { data, error } = await query.select('id,status').single();
    if (error || !data) return Response.json({ message: 'Akun tidak ditemukan atau sudah terjual.' }, { status: 404 });
    if (existingAccount) await syncStock(existingAccount.product_id);
    if (body.productId && body.productId !== existingAccount?.product_id) await syncStock(body.productId);
    return Response.json({ account: data });
  } catch (error) {
    console.error('Accounts PATCH error:', error);
    return Response.json({ message: 'Gagal mengubah status akun.' }, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { id?: string };
    if (!body.id) return Response.json({ message: 'ID akun wajib diisi.' }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: account } = await db.from('account_inventory').select('product_id').eq('id', body.id).maybeSingle();
    const { error } = await db.from('account_inventory').delete().eq('id', body.id).in('status', ['available', 'disabled']);
    if (error) throw error;
    if (account) await syncStock(account.product_id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Accounts DELETE error:', error);
    return Response.json({ message: 'Gagal menghapus akun.' }, { status: 500 });
  }
};