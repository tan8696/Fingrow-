import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function NotFound() {
  const containerRef = useRef(null);
  const titleRef = useRef(null);
  const cardRef = useRef(null);
  const iconRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Floating animation for the icon
      gsap.to(iconRef.current, {
        y: -15,
        rotation: 5,
        duration: 2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      });

      // Staggered entrance animation
      gsap.from(".animate-element", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "back.out(1.2)",
        delay: 0.2
      });

      // 3D Tilt effect on hover
      const card = cardRef.current;
      const handleMouseMove = (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        gsap.to(card, {
          rotateX,
          rotateY,
          transformPerspective: 1000,
          ease: "power2.out",
          duration: 0.4
        });
      };

      const handleMouseLeave = () => {
        gsap.to(card, {
          rotateX: 0,
          rotateY: 0,
          ease: "elastic.out(1, 0.3)",
          duration: 1
        });
      };

      card.addEventListener("mousemove", handleMouseMove);
      card.addEventListener("mouseleave", handleMouseLeave);

      return () => {
        card.removeEventListener("mousemove", handleMouseMove);
        card.removeEventListener("mouseleave", handleMouseLeave);
      };
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const goHome = () => {
    // Add a slight exit animation before redirecting
    gsap.to(containerRef.current, {
      opacity: 0,
      scale: 0.95,
      duration: 0.3,
      onComplete: () => {
        window.location.href = '/';
      }
    });
  };

  return (
    <div 
      ref={containerRef}
      className="min-h-screen relative overflow-hidden bg-background flex flex-col items-center justify-center p-6 text-center"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 0%, var(--color-primary-container) 0%, transparent 50%)',
        opacity: 0.95
      }}
    >
      {/* Decorative background blobs */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-lighten"></div>
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-tertiary/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-lighten"></div>

      <div 
        ref={cardRef}
        className="max-w-md w-full relative z-10 backdrop-blur-xl bg-surface-container-lowest/80 border border-surface-variant/50 rounded-[32px] p-10 shadow-[0_8px_32px_rgba(0,105,72,0.1)] transition-colors"
      >
        <div ref={iconRef} className="text-8xl mb-6 drop-shadow-md">🚜</div>
        
        <h1 
          ref={titleRef}
          className="animate-element font-display-lg text-[80px] leading-none text-transparent bg-clip-text bg-gradient-to-br from-primary to-primary-container font-black tracking-tighter mb-2 drop-shadow-sm"
        >
          404
        </h1>
        
        <h2 className="animate-element font-headline-md text-2xl text-on-surface mt-2 mb-4 font-bold tracking-tight">
          Lost in the fields?
        </h2>
        
        <p className="animate-element font-body-md text-base text-on-surface-variant mb-10 leading-relaxed">
          The page you are looking for seems to have wandered off the beaten path. Let's get you back to familiar grounds.
        </p>
        
        <button
          onClick={goHome}
          className="animate-element w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-2xl font-label-lg text-base shadow-[0_4px_14px_rgba(0,105,72,0.3)] hover:shadow-[0_6px_20px_rgba(0,105,72,0.4)] hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px] group-hover:animate-bounce">home</span>
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
}
