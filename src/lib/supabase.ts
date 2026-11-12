import { createClient } from '@supabase/supabase-js';

// Accept a pasted URL like https://xyz.supabase.co/rest/v1/ and keep only the origin.
function cleanUrl(v: string | undefined): string | undefined {
  if (!v) return v;
  try { return new URL(v.trim()).origin; } catch { return v; }
}
// Values are resolved in vite.config.ts from several accepted variable names (with or without the VITE_ prefix).
const url = cleanUrl(__SUPABASE_URL__);
const key = __SUPABASE_ANON__ || undefined;

export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT-REF'));

// A placeholder client keeps imports safe when unconfigured; <ConfigMissing/> is shown instead of the app.
export const supabase = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? key! : 'unconfigured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
