import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

// Server-side Supabase client using the service-role key (bypasses RLS — keep
// the key server-only, never expose it to the frontend). Null when Supabase
// Storage isn't configured, in which case uploads fall back to local disk.
export const supabase = config.supabase.enabled
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export default supabase;
