import React, { useState, useEffect, Suspense, lazy } from 'react';

const Login = lazy(() => import('./components/Login'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const AdversarialHarness = lazy(() => import('./components/AdversarialHarness'));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'));
const NotFound = lazy(() => import('./components/NotFound'));

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('fingrowProfile');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Simple routing for the test harness and 404
  const path = window.location.pathname;
  if (path === '/test') {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f5fbf5] dark:bg-gray-900 text-[#006948] dark:text-green-400">Loading...</div>}>
        <AdversarialHarness />
      </Suspense>
    );
  }
  
  if (path !== '/' && path !== '') {
    return (
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f5fbf5] dark:bg-gray-900 text-[#006948] dark:text-green-400">Loading...</div>}>
        <NotFound />
      </Suspense>
    );
  }

  const handleProfileComplete = (profile) => {
    setUserProfile(profile);
    localStorage.setItem('fingrowProfile', JSON.stringify(profile));
  };

  const handleKycComplete = () => {
    const updatedProfile = { ...userProfile, kycVerified: true };
    setUserProfile(updatedProfile);
    localStorage.setItem('fingrowProfile', JSON.stringify(updatedProfile));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserProfile(null);
    localStorage.removeItem('fingrowProfile');
  };

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f5fbf5] dark:bg-gray-900 text-[#006948] dark:text-green-400">Loading...</div>}>
      {!isAuthenticated ? (
        <Login onLogin={() => setIsAuthenticated(true)} />
      ) : !userProfile ? (
        <OnboardingWizard onComplete={handleProfileComplete} />
      ) : (
        <Dashboard 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          onLogout={handleLogout} 
          userProfile={userProfile}
          onKycComplete={handleKycComplete}
        />
      )}
    </Suspense>
  );
}

export default App;