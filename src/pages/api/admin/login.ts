import type { APIRoute } from 'astro';
import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, authCookie, getSupabaseAuth } from '../../../lib/admin-auth';

export const POST: APIRoute = async ({ request, redirect }) => {
   const form = await request.formData();
   const email = String(form.get('email') ?? '').trim();
   const password = String(form.get('password') ?? '');
   if (!email || !password) return redirect('/sans-portal?error=1');
   try {
      const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });
      if (error || !data.session) return redirect('/sans-portal?error=1');
      return new Response(null, {
         status: 303,
         headers: [
            ['Location', '/dashboard'],
            ['Set-Cookie', authCookie(ADMIN_ACCESS_COOKIE, data.session.access_token, data.session.expires_in)],
            ['Set-Cookie', authCookie(ADMIN_REFRESH_COOKIE, data.session.refresh_token, 60 * 60 * 24 * 30)],
         ],
      });
   } catch (error) {
      console.error('Supabase admin login error:', error);
      return redirect('/sans-portal?error=1');
   }
};
