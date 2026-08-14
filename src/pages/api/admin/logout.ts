import type { APIRoute } from 'astro';
import { clearAuthCookies } from '../../../lib/admin-auth';

export const GET: APIRoute = () => new Response(null, { status: 303, headers: [['Location', '/admin/login'], ...clearAuthCookies().map((cookie) => ['Set-Cookie', cookie])] });