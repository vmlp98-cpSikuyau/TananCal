import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { AuthScreen, ResetPasswordScreen, VerifyScreen } from './features/auth/AuthScreen';
import { ToastProvider } from './components/Toast';
import { RealtimeProvider } from './lib/realtime';
import { Layout } from './components/Layout';
import { OverviewPage } from './features/overview/OverviewPage';
import { GroupsPage } from './features/groups/GroupsPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { isConfigured } from './lib/supabase';
import { Logo } from './components/Logo';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

function Gate() {
  const { session, loading, recovery, verified } = useAuth();
  if (loading) return <div className="splash"><Logo size={64} /></div>;
  if (recovery && session) return <ResetPasswordScreen />;
  if (!session) return <AuthScreen />;
  if (!verified) return <VerifyScreen />;
  return (
    <RealtimeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupsPage />} />
          <Route path="groups/:groupId/events/:eventId" element={<GroupsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}

function ConfigMissing() {
  return (
    <main className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand"><Logo size={56} /><h1>Almost there</h1></div>
        <p>TananCal needs your Supabase project details.</p>
        <ol>
          <li>Copy <code>.env.local.example</code> to <code>.env.local</code>.</li>
          <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (publishable key only).</li>
          <li>Restart <code>npm run dev</code>.</li>
        </ol>
      </div>
    </main>
  );
}

export default function App() {
  if (!isConfigured) return <ConfigMissing />;
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
