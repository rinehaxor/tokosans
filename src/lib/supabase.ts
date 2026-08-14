import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export function getSupabaseAdmin() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur.');
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as any },
  });
}