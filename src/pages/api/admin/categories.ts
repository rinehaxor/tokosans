import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';

const nameOf = (value: unknown) => String(value ?? '').trim();

export const GET: APIRoute = async () => {
  try {
    const { data, error } = await getSupabaseAdmin().from('categories').select('id,name,description').order('name');
    if (error) throw error;
    return Response.json({ categories: data ?? [] });
  } catch (error) {
    console.error('Categories GET error:', error);
    return Response.json({ message: 'Gagal memuat kategori.' }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { name?: string; description?: string };
    const name = nameOf(body.name);
    const description = nameOf(body.description);
    if (!name || name.length > 50) return Response.json({ message: 'Nama kategori wajib diisi, maksimal 50 karakter.' }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().from('categories').insert({ name, description }).select('id,name,description').single();
    if (error) return Response.json({ message: error.code === '23505' ? 'Kategori sudah ada.' : 'Gagal menambah kategori.' }, { status: error.code === '23505' ? 409 : 500 });
    return Response.json({ category: data });
  } catch { return Response.json({ message: 'Data kategori tidak valid.' }, { status: 400 }); }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { id?: string; name?: string; description?: string };
    const name = nameOf(body.name);
    const description = nameOf(body.description);
    if (!body.id || !name || name.length > 50) return Response.json({ message: 'Data kategori tidak valid.' }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: old } = await db.from('categories').select('name').eq('id', body.id).single();
    if (!old) return Response.json({ message: 'Kategori tidak ditemukan.' }, { status: 404 });
    const { data, error } = await db.from('categories').update({ name, description, updated_at: new Date().toISOString() }).eq('id', body.id).select('id,name,description').single();
    if (error) return Response.json({ message: error.code === '23505' ? 'Kategori sudah ada.' : 'Gagal mengubah kategori.' }, { status: error.code === '23505' ? 409 : 500 });
    const { error: productsError } = await db.from('products').update({ category: name, updated_at: new Date().toISOString() }).eq('category', old.name);
    if (productsError) throw productsError;
    return Response.json({ category: data });
  } catch { return Response.json({ message: 'Gagal mengubah kategori.' }, { status: 500 }); }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { id } = await request.json() as { id?: string };
    if (!id) return Response.json({ message: 'ID kategori wajib diisi.' }, { status: 400 });
    const db = getSupabaseAdmin();
    const { data: category } = await db.from('categories').select('name').eq('id', id).single();
    if (!category) return Response.json({ message: 'Kategori tidak ditemukan.' }, { status: 404 });
    const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('category', category.name);
    if ((count ?? 0) > 0) return Response.json({ message: 'Kategori masih dipakai produk dan tidak dapat dihapus.' }, { status: 409 });
    const { error } = await db.from('categories').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch { return Response.json({ message: 'Gagal menghapus kategori.' }, { status: 500 }); }
};