import type { APIRoute } from 'astro';
import { getSiteUrl } from '../lib/site';
import { getPublishedPosts } from '../lib/blog';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toLastmod(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export const GET: APIRoute = async ({ request }) => {
  const site = getSiteUrl(new URL(request.url).origin);

  const staticPages: { path: string; lastmod?: string }[] = [
    { path: '/' },
    { path: '/blog' },
    { path: '/syarat-ketentuan' },
    { path: '/kebijakan-privasi' },
    { path: '/kebijakan-refund' },
  ];

  let posts: Awaited<ReturnType<typeof getPublishedPosts>> = [];
  try {
    posts = await getPublishedPosts();
  } catch {
    /* Supabase tidak tersedia — sitemap tetap berisi halaman statis */
  }

  const urls = [
    ...staticPages.map((page) => ({ loc: `${site}${page.path}`, lastmod: '' })),
    ...posts.map((post) => ({
      loc: `${site}/blog/${post.slug}`,
      lastmod: toLastmod(post.updated_at || post.published_at || ''),
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map((entry) => {
        const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
        return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`;
      })
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};