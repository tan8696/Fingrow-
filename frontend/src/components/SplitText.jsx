import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function SplitText({ text, delay = 0, duration = 0.6, className = "" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const chars = containerRef.current.querySelectorAll('.split-char');
    
    gsap.fromTo(
      chars,
      { opacity: 0, y: 20 },
      {
        opacity: 1,
        y: 0,
        duration: duration,
        stagger: 0.03,
        delay: delay / 1000, // Assuming delay is passed in ms
        ease: "power3.out",
      }
    );
  }, [text, delay, duration]);

  return (
    <span ref={containerRef} className={`inline-block ${className}`}>
      {text.split('').map((char, index) => (
        <span
          key={index}
          className="split-char inline-block whitespace-pre"
          style={{ opacity: 0 }} // Prevent FOUC before animation starts
        >
          {char}
        </span>
      ))}
    </span>
  );
}
