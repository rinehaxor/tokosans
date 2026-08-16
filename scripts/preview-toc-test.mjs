// Skrip uji sementara untuk fitur TOC + produk terkait di halaman artikel.
// Pakai: node scripts/preview-toc-test.mjs create  -> buat artikel uji (slug: preview-toc-test)
//        node scripts/preview-toc-test.mjs delete  -> hapus artikel uji
// Memakai REST PostgREST langsung agar tidak butuh WebSocket (Node 20).
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const slug = 'preview-toc-test';
const endpoint = `${env.SUPABASE_URL}/rest/v1/blog_posts`;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const action = process.argv[2] || 'create';
if (action === 'create') {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      slug,
      title: 'Preview TOC dan Produk Terkait',
      category: 'Umum',
      excerpt: 'Uji render daftar isi pada halaman artikel.',
      content: '<h2>Pendahuluan</h2><p>Paragraf pembuka yang menyebut Canva sebagai contoh produk.</p><h2>Cara Kerja</h2><p>Paragraf penjelasan.</p><h3>Sub Langkah</h3><p>Detail sub langkah.</p><h3>Sub Verifikasi</h3><p>Detail verifikasi.</p><h2>Penutup</h2><p>Selesai.</p>',
      status: 'published',
      published_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) { console.error('CREATE FAILED:', res.status, await res.text()); process.exit(1); }
  console.log('OK: artikel uji dibuat ->', slug);
} else {
  const res = await fetch(`${endpoint}?slug=eq.${slug}`, { method: 'DELETE', headers });
  if (!res.ok) { console.error('DELETE FAILED:', res.status, await res.text()); process.exit(1); }
  console.log('OK: artikel uji dihapus ->', slug);
}