import React from 'react';

export default function NotFound() {
  const goHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center animate-in">
      <div className="max-w-md w-full bg-surface-container-lowest border border-surface-variant rounded-3xl p-8 shadow-sm">
        <div className="text-6xl mb-4">🚜🌾</div>
        <h1 className="font-display-lg text-display-lg text-on-surface font-bold tracking-tight">404</h1>
        <h2 className="font-headline-md text-[20px] text-on-surface mt-2 mb-4 font-semibold">
          Lost in the fields?
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-8">
          The page you are looking for seems to have wandered off or doesn't exist. Let's get you back to familiar grounds.
        </p>
        <button
          onClick={goHome}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg shadow-sm hover:bg-primary-container hover:shadow-md transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">home</span>
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
