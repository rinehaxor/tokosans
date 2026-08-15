import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur.');
  
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket as any },
    });
  }
  
  return adminClient;
}