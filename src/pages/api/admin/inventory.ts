import type { APIRoute } from 'astro';
import { getProduct } from '../../../lib/products';
import { getSupabaseAdmin } from '../../../lib/supabase';


export const GET: APIRoute = async () => {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('inventory').select('product_id,stock,price,active,image_url,updated_at');
    if (error) throw error;
    return Response.json({ inventory: data ?? [] });
  } catch (error) {
    console.error('Inventory GET error:', error);
    return Response.json({ message: 'Inventory belum tersedia.' }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let body: { productId?: string; price?: number | string; active?: boolean | string; image?: File | null };
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      body = { productId: String(form.get('productId') ?? ''), price: String(form.get('price') ?? ''), active: form.get('active') === 'on', image: form.get('image') instanceof File ? form.get('image') as File : null };
    } else {
      body = await request.json();
    }
    const product = body.productId ? await getProduct(body.productId) : undefined;
    const price = Number(body.price);
    if (!product || !Number.isInteger(price) || price <= 0 || (body.active !== true && body.active !== false && body.active !== 'true' && body.active !== 'false')) {
      return Response.json({ message: 'Data produk tidak valid.' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { count: stock, error: stockError } = await db.from('account_inventory').select('id', { count: 'exact', head: true }).eq('product_id', product.id).eq('status', 'available');
    if (stockError) throw stockError;
    let imageUrl: string | undefined;
    if (body.image && body.image.size > 0) {
      if (!body.image.type.startsWith('image/') || body.image.size > 5 * 1024 * 1024) return Response.json({ message: 'Gambar harus berupa file image maksimal 5 MB.' }, { status: 400 });
      const extension = body.image.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${product.id}-${Date.now()}.${extension}`;
      const upload = await db.storage.from('product-images').upload(path, body.image, { contentType: body.image.type, upsert: true });
      if (upload.error) throw upload.error;
      imageUrl = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const payload = { product_id: product.id, stock: stock ?? 0, price, active: body.active === true || body.active === 'true', updated_at: new Date().toISOString(), ...(imageUrl ? { image_url: imageUrl } : {}) };
    const { data, error } = await db.from('inventory').upsert(payload).select().single();
    if (error) throw error;
    return Response.json({ inventory: data });
  } catch (error) {
    console.error('Inventory POST error:', error);
    return Response.json({ message: 'Gagal menyimpan inventory.' }, { status: 500 });
  }
};