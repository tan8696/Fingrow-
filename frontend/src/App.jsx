import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdversarialHarness from './components/AdversarialHarness';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');

  // Simple routing for the test harness
  if (window.location.pathname === '/test') {
    return <AdversarialHarness />;
  }

  return (
    <>
      {isAuthenticated ? (
        <Dashboard currentView={currentView} setCurrentView={setCurrentView} onLogout={() => setIsAuthenticated(false)} />
      ) : (
        <Login onLogin={() => setIsAuthenticated(true)} />
      )}
    </>
  );
}

export default App;