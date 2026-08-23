import type { APIRoute } from 'astro';
import { getSiteUrl } from '../lib/site';
import { getPublishedPosts } from '../lib/blog';
import { getProducts } from '../lib/products';

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

  const staticPages: { path: string; changefreq?: string; priority?: string; lastmod?: string }[] = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/blog', changefreq: 'daily', priority: '0.8' },
    { path: '/syarat-ketentuan', changefreq: 'monthly', priority: '0.4' },
    { path: '/kebijakan-privasi', changefreq: 'monthly', priority: '0.4' },
    { path: '/kebijakan-refund', changefreq: 'monthly', priority: '0.4' },
  ];

  let posts: Awaited<ReturnType<typeof getPublishedPosts>> = [];
  try {
    posts = await getPublishedPosts();
  } catch {
    /* Supabase tidak tersedia — sitemap tetap berisi halaman statis */
  }

  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts();
  } catch {
    /* fallback ke katalog default bila gagal */
  }

  const urls: { loc: string; lastmod?: string; changefreq?: string; priority?: string }[] = [
    ...staticPages.map((page) => ({
      loc: `${site}${page.path}`,
      lastmod: '',
      changefreq: page.changefreq,
      priority: page.priority,
    })),
    ...products
      .filter((p) => p.active !== false)
      .map((p) => ({
        loc: `${site}/checkout/${encodeURIComponent(p.id)}`,
        lastmod: '',
        changefreq: 'weekly',
        priority: '0.9',
      })),
    ...posts.map((post) => ({
      loc: `${site}/blog/${post.slug}`,
      lastmod: toLastmod(post.updated_at || post.published_at || ''),
      changefreq: 'weekly',
      priority: '0.7',
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map((entry) => {
        const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : '';
        const changefreq = entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : '';
        const priority = entry.priority ? `\n    <priority>${entry.priority}</priority>` : '';
        return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}${changefreq}${priority}\n  </url>`;
      })
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
