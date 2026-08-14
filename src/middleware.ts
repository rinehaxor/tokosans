import { defineMiddleware } from 'astro:middleware';
import { ADMIN_ACCESS_COOKIE, getSupabaseAuth } from './lib/admin-auth';

export const onRequest = defineMiddleware(async ({ url, cookies, redirect }, next) => {
  const protectedPath = url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/') || url.pathname.startsWith('/api/admin/');
  const publicAdminPath = url.pathname === '/admin/login' || url.pathname === '/api/admin/login' || url.pathname === '/api/admin/logout';
  let authenticated = false;
  if (protectedPath && !publicAdminPath) {
    try {
      const token = cookies.get(ADMIN_ACCESS_COOKIE)?.value;
      if (token) authenticated = Boolean((await getSupabaseAuth().auth.getUser(token)).data.user);
    } catch (error) { console.error('Admin auth error:', error); }
  }
  if (protectedPath && !publicAdminPath && !authenticated) {
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ message: 'Admin login diperlukan.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return redirect('/admin/login');
  }
  return next();
});