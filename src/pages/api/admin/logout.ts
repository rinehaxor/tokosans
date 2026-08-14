import type { APIRoute } from 'astro';
import { clearAuthCookies } from '../../../lib/admin-auth';

export const GET: APIRoute = () => new Response(null, { status: 303, headers: [['Location', '/sans-portal'], ...clearAuthCookies().map((cookie) => ['Set-Cookie', cookie])] });
