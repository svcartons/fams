import React, { Suspense, useState, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router';
import { Toaster } from 'sonner';
import { useAuth } from './hooks/useAuth';
import { Navigation } from './components/Navigation';
import { TourOrchestrator } from './components/tour/TourOrchestrator';

const Login = React.lazy(() => import('./components/Login').then(m => ({ default: m.Login })));
const Today = React.lazy(() => import('./components/Today').then(m => ({ default: m.Today })));
const WorkerDirectory = React.lazy(() => import('./components/WorkerDirectory').then(m => ({ default: m.WorkerDirectory })));
const Reports = React.lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const ManualCorrections = React.lazy(() => import('./components/ManualCorrections').then(m => ({ default: m.ManualCorrections })));
const AuditLogs = React.lazy(() => import('./components/AuditLogs').then(m => ({ default: m.AuditLogs })));
const Settings = React.lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const KioskMode = React.lazy(() => import('./components/KioskMode').then(m => ({ default: m.KioskMode })));
const ForgotPassword = React.lazy(() => import('./components/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const Setup = React.lazy(() => import('./components/Setup').then(m => ({ default: m.Setup })));
const Welcome = React.lazy(() => import('./components/Welcome').then(m => ({ default: m.Welcome })));

function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

function ProtectedShell() {
  const { isAuthenticated, user, authReady } = useAuth();
  const [tourDismissed, setTourDismissed] = useState(false);
  const handleTourComplete = useCallback(() => setTourDismissed(true), []);

  if (!authReady) {
    return (
      <div className="fams-page flex items-center justify-center min-h-screen">
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const showTour = user && user.hasSeenOnboarding === false && !tourDismissed;

  return (
    <>
      <div className="size-full flex flex-col md:flex-row bg-[var(--canvas)] overflow-hidden">
        <Navigation />
        <main className="flex-1 min-h-0 min-w-0">
          <div className="size-full overflow-y-auto pb-16 md:pb-0">
            <Outlet />
          </div>
        </main>
      </div>
      {showTour && <TourOrchestrator onComplete={handleTourComplete} />}
    </>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

const PageLoader = () => (
  <div className="fams-page flex items-center justify-center min-h-screen">
    <p className="text-[13px] text-[var(--muted)]">Loading…</p>
  </div>
);

export default function App() {
  return (
    <div className="size-full bg-[var(--canvas)]">
      <Toaster position="top-right" richColors toastOptions={{ style: { fontSize: '13px', borderRadius: '6px' } }} />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
          <Route path="/forgot-password" element={<AuthRedirect><ForgotPassword /></AuthRedirect>} />
          <Route path="/setup" element={<AuthRedirect><Setup /></AuthRedirect>} />
          <Route path="/kiosk" element={<div className="size-full bg-white"><KioskMode /></div>} />

          <Route element={<ProtectedShell />}>
            <Route path="/today" element={<Today />} />
            <Route path="/live" element={<Navigate to="/today" replace />} />
            <Route path="/workers" element={<WorkerDirectory />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/daily-report" element={<Navigate to="/reports?tab=attendance" replace />} />
            <Route path="/salary-calculator" element={<Navigate to="/reports?tab=payroll" replace />} />
            <Route path="/corrections" element={<ManualCorrections />} />
            <Route path="/audit" element={<AdminGate><AuditLogs /></AdminGate>} />
            <Route path="/settings" element={<AdminGate><Settings /></AdminGate>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
