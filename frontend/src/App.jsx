import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdversarialHarness from './components/AdversarialHarness';
import OnboardingWizard from './components/OnboardingWizard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('fingrowProfile');
    return saved ? JSON.parse(saved) : null;
  });

  // Simple routing for the test harness
  if (window.location.pathname === '/test') {
    return <AdversarialHarness />;
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