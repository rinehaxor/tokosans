import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { generateSlug } from '../../../lib/blog';

const str = (v: unknown) => String(v ?? '').trim();

export const GET: APIRoute = async () => {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('blog_posts')
      .select('id,slug,title,category,excerpt,cover_url,status,published_at,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ posts: data ?? [] });
  } catch (error) {
    console.error('Blog GET error:', error);
    return Response.json({ message: 'Gagal memuat artikel.' }, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = str(body.title);
    const category = str(body.category) || 'Umum';
    const content = str(body.content);
    const excerpt = str(body.excerpt);
    const cover_url = str(body.cover_url) || null;
    const status = body.status === 'published' ? 'published' : 'draft';

    if (!title || title.length > 200) return Response.json({ message: 'Judul wajib diisi (maks 200 karakter).' }, { status: 400 });
    if (!content) return Response.json({ message: 'Konten artikel wajib diisi.' }, { status: 400 });

    let slug = str(body.slug) || generateSlug(title);
    if (!slug) slug = `post-${Date.now()}`;

    const published_at = status === 'published' ? new Date().toISOString() : null;

    const { data, error } = await getSupabaseAdmin()
      .from('blog_posts')
      .insert({ slug, title, category, excerpt, content, cover_url, status, published_at })
      .select('id,slug,title,category,status')
      .single();

    if (error) {
      if (error.code === '23505') return Response.json({ message: 'Slug sudah digunakan, ubah judul atau slug.' }, { status: 409 });
      throw error;
    }

    return Response.json({ post: data });
  } catch (error) {
    console.error('Blog POST error:', error);
    return Response.json({ message: 'Gagal membuat artikel.' }, { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = str(body.id);
    if (!id) return Response.json({ message: 'ID artikel wajib diisi.' }, { status: 400 });

    const title = str(body.title);
    const category = str(body.category) || 'Umum';
    const content = str(body.content);
    const excerpt = str(body.excerpt);
    const cover_url = str(body.cover_url) || null;
    const status = body.status === 'published' ? 'published' : 'draft';

    if (!title || title.length > 200) return Response.json({ message: 'Judul wajib diisi (maks 200 karakter).' }, { status: 400 });
    if (!content) return Response.json({ message: 'Konten artikel wajib diisi.' }, { status: 400 });

    let slug = str(body.slug) || generateSlug(title);
    if (!slug) slug = `post-${Date.now()}`;

    const db = getSupabaseAdmin();
    const { data: existing } = await db.from('blog_posts').select('id,published_at').eq('id', id).single();
    if (!existing) return Response.json({ message: 'Artikel tidak ditemukan.' }, { status: 404 });

    const published_at = status === 'published'
      ? (existing.published_at || new Date().toISOString())
      : null;

    const { data, error } = await db
      .from('blog_posts')
      .update({ slug, title, category, excerpt, content, cover_url, status, published_at, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,slug,title,category,status')
      .single();

    if (error) {
      if (error.code === '23505') return Response.json({ message: 'Slug sudah digunakan oleh artikel lain.' }, { status: 409 });
      throw error;
    }

    return Response.json({ post: data });
  } catch (error) {
    console.error('Blog PATCH error:', error);
    return Response.json({ message: 'Gagal mengubah artikel.' }, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { id } = await request.json() as { id?: string };
    if (!id) return Response.json({ message: 'ID artikel wajib diisi.' }, { status: 400 });

    const { error } = await getSupabaseAdmin().from('blog_posts').delete().eq('id', id);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Blog DELETE error:', error);
    return Response.json({ message: 'Gagal menghapus artikel.' }, { status: 500 });
  }
};
