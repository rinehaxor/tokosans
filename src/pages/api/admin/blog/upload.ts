import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../../lib/supabase';

function slugifyFilename(name: string): string {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || 'jpg' : 'jpg';
  const base = parts.join('.');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${slug || 'image'}-${Date.now()}.${ext}`;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return Response.json({ message: 'File gambar wajib dipilih.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return Response.json({ message: 'File harus berupa gambar (JPG, PNG, WebP, GIF, SVG, dll).' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ message: 'Ukuran gambar maksimal 5 MB.' }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const path = slugifyFilename(file.name);

    // Ensure bucket exists or try blog-images first, fallback to product-images
    let bucket = 'blog-images';
    let uploadRes = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: true });

    if (uploadRes.error) {
      console.warn('Gagal upload ke blog-images bucket, mencoba product-images...', uploadRes.error);
      bucket = 'product-images';
      uploadRes = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: true });
    }

    if (uploadRes.error) {
      console.error('Storage upload error:', uploadRes.error);
      return Response.json({ message: `Gagal mengunggah gambar: ${uploadRes.error.message}` }, { status: 500 });
    }

    const publicUrl = db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

    return Response.json({ url: publicUrl, success: true });
  } catch (error) {
    console.error('Blog image upload exception:', error);
    return Response.json({ message: 'Terjadi kesalahan saat mengunggah gambar.' }, { status: 500 });
  }
};
