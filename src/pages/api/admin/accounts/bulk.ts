import type { APIRoute } from 'astro';
import { getProduct } from '../../../../lib/products';
import { getProductPackages } from '../../../../lib/packages';
import { getSupabaseAdmin } from '../../../../lib/supabase';

async function syncStock(productId: string) {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from('account_inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('status', 'available');
  if (error) throw error;
  const { error: syncError } = await db
    .from('inventory')
    .update({ stock: count ?? 0, updated_at: new Date().toISOString() })
    .eq('product_id', productId);
  if (syncError) throw syncError;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as {
      productId?: string;
      packageId?: string;
      items?: Array<{ login: string; password: string }>;
    };

    const productId = String(body.productId ?? '').trim();
    const rawPackageId = body.packageId || productId;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!productId || !(await getProduct(productId))) {
      return Response.json({ message: 'Produk tidak valid atau tidak ditemukan.' }, { status: 400 });
    }

    if (items.length === 0) {
      return Response.json({ message: 'Tidak ada data akun yang dikirim.' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const product = (await getProduct(productId))!;
    const packages = await getProductPackages(product);

    if (rawPackageId !== productId && !packages.some((item) => item.id === rawPackageId && item.active)) {
      return Response.json({ message: 'Paket tidak valid untuk produk ini.' }, { status: 400 });
    }

    const packageId = rawPackageId === productId ? null : rawPackageId;

    // Filter valid login & password pairs
    const validRows = items
      .map((item) => ({
        login: String(item.login ?? '').trim(),
        password: String(item.password ?? ''),
      }))
      .filter((item) => item.login && item.password);

    if (validRows.length === 0) {
      return Response.json({ message: 'Semua baris akun tidak valid (login dan password wajib diisi).' }, { status: 400 });
    }

    const insertData = validRows.map((row) => ({
      product_id: productId,
      package_id: packageId,
      login: row.login,
      password: row.password,
      status: 'available' as const,
    }));

    // Perform batch insert
    const { data, error } = await db
      .from('account_inventory')
      .insert(insertData)
      .select('id, product_id, package_id, login, status, created_at');

    if (error) {
      console.error('Bulk accounts insert database error:', error);
      throw error;
    }

    // Sync inventory stock
    await syncStock(productId);

    return Response.json({
      success: true,
      count: data ? data.length : validRows.length,
      accounts: data ?? [],
    });
  } catch (error) {
    console.error('Accounts Bulk POST error:', error);
    return Response.json({ message: 'Gagal mengimpor data akun.' }, { status: 500 });
  }
};
