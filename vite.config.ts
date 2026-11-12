import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Only these two (public) values are copied into the browser bundle, under any of the accepted names.
// Plain names (SUPABASE_URL / SUPABASE_ANON, or DB_URL / ANON_KEY) work on hosts that dislike the VITE_ prefix.
// Never put a service_role/secret key in any of them.
const first = (env: Record<string, string>, names: string[]) =>
  names.map((n) => env[n]).find((v) => v && v.trim()) ?? '';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(first(env, ['SUPABASE_URL', 'DB_URL', 'VITE_SUPABASE_URL', 'VITE_DB_URL'])),
      __SUPABASE_ANON__: JSON.stringify(first(env, ['SUPABASE_ANON', 'ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON'])),
    },
    server: { port: 5173, strictPort: false },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
