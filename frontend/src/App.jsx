import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdversarialHarness from './components/AdversarialHarness';
import OnboardingWizard from './components/OnboardingWizard';

import NotFound from './components/NotFound';

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
    return <AdversarialHarness />;
  }
  
  if (path !== '/' && path !== '') {
    return <NotFound />;
  }

  const handleProfileComplete = (profile) => {
    setUserProfile(profile);
    localStorage.setItem('fingrowProfile', JSON.stringify(profile));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserProfile(null);
    localStorage.removeItem('fingrowProfile');
  };

  return (
    <>
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
        />
      )}
    </>
  );
}

export default App;