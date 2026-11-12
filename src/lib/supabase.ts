import { createClient } from '@supabase/supabase-js';

// Accept a pasted URL like https://xyz.supabase.co/rest/v1/ and keep only the origin.
function cleanUrl(v: string | undefined): string | undefined {
  if (!v) return v;
  try { return new URL(v.trim()).origin; } catch { return v; }
}
const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
// VITE_SUPABASE_ANON is an alias for hosts (e.g. Vercel) that refuse public variable names containing "KEY".
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON) as string | undefined;

export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT-REF'));

// A placeholder client keeps imports safe when unconfigured; <ConfigMissing/> is shown instead of the app.
export const supabase = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? key! : 'unconfigured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
