import type { APIRoute } from 'astro';
import { getSiteUrl } from '../lib/site';

export const GET: APIRoute = ({ request }) => {
  const site = getSiteUrl(new URL(request.url).origin);

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /dashboard',
    'Disallow: /dashboard/',
    'Disallow: /api/',
    'Disallow: /sans-portal',
    'Disallow: /payment/',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
