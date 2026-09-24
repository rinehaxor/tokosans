import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getProduct } from '../../../lib/products';
import { getCategories } from '../../../lib/categories';

const text = (value: FormDataEntryValue | null) => String(value ?? '').trim();

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ message: 'ID produk wajib diisi.' }, { status: 400 });
  const product = await getProduct(id);
  return product ? Response.json({ product }) : Response.json({ message: 'Produk tidak ditemukan.' }, { status: 404 });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const id = text(form.get('id'));
    const name = text(form.get('name'));
    const category = text(form.get('category'));
    const duration = text(form.get('duration'));
    const description = text(form.get('description'));
    const terms = text(form.get('terms'));
    const icon = text(form.get('icon')) || '✦';
    const badge = text(form.get('badge')) || null;
    const price = Number(form.get('price'));
    const rawOriginalPrice = form.get('original_price');
    const original_price = rawOriginalPrice && !isNaN(Number(rawOriginalPrice)) && Number(rawOriginalPrice) > 0 ? Number(rawOriginalPrice) : null;
    let packages: Array<{ name?: string; duration?: string; price?: number; active?: boolean; digiflazz_sku?: string; requires_customer_no?: boolean; customer_no_label?: string }> = [];
    try { packages = JSON.parse(text(form.get('packages') || '[]')); } catch { return Response.json({ message: 'Format paket tidak valid.' }, { status: 400 }); }
    if (!Array.isArray(packages) || packages.some((item) => !String(item.name ?? '').trim() || !String(item.duration ?? '').trim() || !Number.isInteger(Number(item.price)) || Number(item.price) <= 0)) return Response.json({ message: 'Lengkapi nama, durasi, dan harga setiap paket.' }, { status: 400 });
    const active = form.get('active') === 'on';
    const categories = await getCategories();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !name || !categories.some((item) => item.name === category) || !duration || !description || !Number.isInteger(price) || price <= 0) {
      return Response.json({ message: 'Data produk tidak valid.' }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const image = form.get('image');
    let imageUrl: string | undefined;
    if (image instanceof File && image.size > 0) {
      if (!image.type.startsWith('image/') || image.size > 5 * 1024 * 1024) return Response.json({ message: 'Gambar harus berupa file image maksimal 5 MB.' }, { status: 400 });
      const path = `${id}-${Date.now()}.${image.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
      const upload = await db.storage.from('product-images').upload(path, image, { contentType: image.type, upsert: true });
      if (upload.error) throw upload.error;
      imageUrl = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const productPayload = { id, name, category, duration, price, original_price, description, terms, icon, badge, active, updated_at: new Date().toISOString() };
    const { error: productError } = await db.from('products').upsert(productPayload);
    if (productError) throw productError;
    const { data: existingPackages, error: existingPackagesError } = await db.from('product_packages').select('id').eq('product_id', id).order('created_at');
    if (existingPackagesError) throw existingPackagesError;
    const packageRows = packages.map((item) => {
      const sku = String(item.digiflazz_sku ?? '').trim();
      const requiresCustomerNo = sku ? item.requires_customer_no === true : false;
      return {
        product_id: id,
        name: item.name!.trim(),
        duration: item.duration!.trim(),
        price: Number(item.price),
        active: item.active !== false,
        digiflazz_sku: sku || null,
        requires_customer_no: requiresCustomerNo,
        customer_no_label: requiresCustomerNo ? (String(item.customer_no_label ?? '').trim() || 'User ID') : (String(item.customer_no_label ?? '').trim() || null),
      };
    });
    for (const [index, packageRow] of packageRows.entries()) {
      const existingId = existingPackages?.[index]?.id;
      const { error: packageError } = existingId
        ? await db.from('product_packages').update({ ...packageRow, updated_at: new Date().toISOString() }).eq('id', existingId)
        : await db.from('product_packages').insert(packageRow);
      if (packageError) throw packageError;
    }
    const removedPackages = (existingPackages ?? []).slice(packageRows.length).map((item) => item.id);
    if (removedPackages.length) {
      const { error: deactivateError } = await db.from('product_packages').update({ active: false, updated_at: new Date().toISOString() }).in('id', removedPackages);
      if (deactivateError) throw deactivateError;
    }
    const { count: availableStock, error: stockError } = await db.from('account_inventory').select('id', { count: 'exact', head: true }).eq('product_id', id).eq('status', 'available');
    if (stockError) throw stockError;
    const { data: currentInventory } = await db.from('inventory').select('image_url').eq('product_id', id).maybeSingle();
    const { error: inventoryError } = await db.from('inventory').upsert({ product_id: id, price, stock: availableStock ?? 0, active, ...(imageUrl ? { image_url: imageUrl } : currentInventory?.image_url ? { image_url: currentInventory.image_url } : {}), updated_at: new Date().toISOString() });
    if (inventoryError) throw inventoryError;
    return Response.json({ ok: true, id });
  } catch (error) {
    console.error('Products POST error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ message: `Gagal menyimpan produk: ${detail}` }, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { id } = await request.json() as { id?: string };
    if (!id || !(await getProduct(id))) return Response.json({ message: 'Produk tidak ditemukan.' }, { status: 404 });
    const db = getSupabaseAdmin();
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid');
    const { data: items } = await db.from('order_items').select('id').eq('product_id', id).limit(1);
    if ((count ?? 0) > 0 && items?.length) return Response.json({ message: 'Produk yang sudah pernah terjual tidak dapat dihapus.' }, { status: 409 });
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) throw error;
    await db.from('inventory').delete().eq('product_id', id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Products DELETE error:', error);
    return Response.json({ message: 'Gagal menghapus produk.' }, { status: 500 });
  }
};