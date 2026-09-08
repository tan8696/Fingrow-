import { useState, useRef, useEffect } from 'react';

const LANG_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  or: 'or-IN',
};

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

/**
 * VoiceMicButton — a tap-to-speak mic button that uses the browser's
 * Web Speech API.  On speech result it calls `onResult(transcript)`.
 *
 * Props:
 *   onResult(text)  — called with the recognised transcript string.
 *   lang            — app-level language code (en / hi / mr …).
 *   className       — extra CSS classes for the outer wrapper.
 */
export default function VoiceMicButton({ onResult, lang = 'en', className = '' }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!SpeechRecognition) {
      setSupported(false);
    }
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = LANG_MAP[lang] || 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript && onResult) onResult(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Stop listening' : 'Speak to type'}
      title={listening ? 'Listening… tap to stop' : 'Tap to speak'}
      className={`voice-mic-btn ${listening ? 'voice-mic-btn--active' : ''} ${className}`}
    >
      {listening && <span className="voice-mic-btn__pulse" />}
      <span className="material-symbols-outlined text-[20px]">
        {listening ? 'hearing' : 'mic'}
      </span>
    </button>
  );
}
