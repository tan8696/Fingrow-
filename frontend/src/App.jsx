import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { clearSession, fetchMe, getStoredUser, getToken, logout, onUnauthorized, updateProfile } from './hooks/auth';

const Login = lazy(() => import('./components/Login'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const AdversarialHarness = lazy(() => import('./components/AdversarialHarness'));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'));
const NotFound = lazy(() => import('./components/NotFound'));

const Splash = ({ children }) => (
  <div className="flex h-screen items-center justify-center bg-[#f5fbf5] dark:bg-gray-900 text-[#006948] dark:text-green-400">
    {children}
  </div>
);

function App() {
  // `undefined` means "still checking the stored session" — distinct from
  // `null`, which means signed out. Without that distinction the login screen
  // flashes on every refresh.
  const [user, setUser] = useState(undefined);

  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Validate any stored session against the server on startup.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setUser(null);
      return undefined;
    }
    setUser(getStoredUser() ?? undefined);
    fetchMe().then((resolved) => {
      if (!cancelled) setUser(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API layer fires this when the server rejects our token mid-session.
  useEffect(() => {
    onUnauthorized(() => setUser(null));
  }, []);

  const handleProfileComplete = useCallback(async (profile) => {
    // Optimistic so onboarding never stalls on a slow connection; the server
    // copy is authoritative once it responds.
    setUser((current) => ({ ...current, profile: { ...(current?.profile || {}), ...profile } }));
    try {
      const saved = await updateProfile({ name: profile.name, profile });
      setUser(saved);
    } catch {
      // Kept locally; the next profile save will retry.
    }
  }, []);

  const handleKycComplete = useCallback(async () => {
    setUser((current) => ({
      ...current,
      profile: { ...(current?.profile || {}), kycVerified: true },
    }));
    try {
      setUser(await updateProfile({ profile: { kycVerified: true } }));
    } catch {
      // Same as above.
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setUser(null);
    setCurrentView('dashboard');
    try {
      await logout();
    } catch {
      clearSession();
    }
  }, []);

  // Simple routing for the test harness and 404
  const path = window.location.pathname;
  if (path === '/test') {
    return (
      <Suspense fallback={<Splash>Loading...</Splash>}>
        <AdversarialHarness />
      </Suspense>
    );
  }

  if (path !== '/' && path !== '') {
    return (
      <Suspense fallback={<Splash>Loading...</Splash>}>
        <NotFound />
      </Suspense>
    );
  }

  if (user === undefined) {
    return <Splash>Loading...</Splash>;
  }

  const profile = user?.profile || {};
  // Onboarding is complete once the account has told us how it will use the
  // app — `type` is 'farmer' or 'entrepreneur', read across the dashboard.
  const needsOnboarding = user && !profile.type;

  return (
    <Suspense fallback={<Splash>Loading...</Splash>}>
      {!user ? (
        <Login onAuthenticated={setUser} />
      ) : needsOnboarding ? (
        <OnboardingWizard onComplete={handleProfileComplete} defaultName={user.name} />
      ) : (
        <Dashboard
          currentView={currentView}
          setCurrentView={setCurrentView}
          onLogout={handleLogout}
          userProfile={{ ...profile, name: user.name, phone: user.phone }}
          onKycComplete={handleKycComplete}
        />
      )}
    </Suspense>
  );
}

export default App;
