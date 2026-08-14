import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export const ADMIN_ACCESS_COOKIE = 'tokosans_admin_access_token';
export const ADMIN_REFRESH_COOKIE = 'tokosans_admin_refresh_token';

export const getSupabaseAuth = () => {
  const url = import.meta.env.SUPABASE_URL;
  // The anon key is preferred for Supabase Auth. The service-role fallback keeps
  // existing server-only deployments working when only that key is configured.
  const key = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL dan SUPABASE_ANON_KEY (atau SUPABASE_SERVICE_ROLE_KEY server) wajib diatur untuk login admin.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as any },
  });
};

export const authCookie = (name: string, value: string, maxAge: number) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${import.meta.env.PROD ? '; Secure' : ''}`;
export const clearAuthCookies = () => [authCookie(ADMIN_ACCESS_COOKIE, '', 0), authCookie(ADMIN_REFRESH_COOKIE, '', 0)];