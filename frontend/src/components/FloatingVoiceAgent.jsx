import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { sendChatMessage } from '../hooks/useReport';

export default function FloatingVoiceAgent({ onNavigate, setMargin, language, onLanguageChange, currentView }) {
  const { t, i18n } = useTranslation();
  const currentLang = language || i18n.language || 'en';

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('voice'); // 'voice' | 'chat'
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState(t('voice_agent.tap_mic'));
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: t('voice_agent.welcome') }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const chatBottomRef = useRef(null);

  // Keep welcome message updated when language changes
  useEffect(() => {
    setStatusText(t('voice_agent.tap_mic'));
    setChatMessages(prev => {
      if (prev.length <= 1) {
        return [{ role: 'assistant', text: t('voice_agent.welcome') }];
      }
      return prev;
    });
  }, [currentLang, t]);

  // Determine speech recognition locale string
  const speechLang = currentLang === 'mr' ? 'mr-IN' : currentLang === 'hi' ? 'hi-IN' : 'en-IN';

  // Initialize Web Speech API recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const tResult = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += tResult + ' ';
          } else {
            interimTranscript += tResult;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => (prev + ' ' + finalTranscript).trim());
        } else if (interimTranscript) {
          setTranscript(prev => {
            const base = prev.split('…')[0];
            return (base + ' …' + interimTranscript).trim();
          });
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition status:', event.error);
        if (event.error === 'no-speech') {
          setStatusText(currentLang === 'mr' ? 'आवाज ऐकू आला नाही. पुन्हा बोला.' : currentLang === 'hi' ? 'कोई आवाज नहीं मिली। कृपया पुनः प्रयास करें।' : 'No speech detected. Please tap mic and try again.');
        } else if (event.error === 'not-allowed') {
          setStatusText(currentLang === 'mr' ? 'मायक्रोफोन परवानगी नाही. चॅट वापरा.' : currentLang === 'hi' ? 'माइक की अनुमति नहीं है। चैट मोड का उपयोग करें।' : 'Microphone access not allowed. You can type in Chat mode.');
        } else {
          setStatusText(`Status: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
  }, [speechLang, currentLang]);

  // Update recognition language dynamically when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = speechLang;
    }
  }, [speechLang]);

  // Multilingual Speech Synthesis
  const speak = useCallback((text) => {
    if (!synthRef.current) return;
    try {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLang;
      utterance.rate = 0.95; // Steady, clear delivery for rural audio

      const voices = synthRef.current.getVoices() || [];
      let matchedVoice = null;
      if (currentLang === 'mr') {
        matchedVoice = voices.find(v => v.lang === 'mr-IN' || v.lang.startsWith('mr') || v.name.toLowerCase().includes('marathi'));
        if (!matchedVoice) {
          // Fallback to Hindi voice for natural Devanagari phonetics
          matchedVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi'));
        }
      } else if (currentLang === 'hi') {
        matchedVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi'));
      } else {
        matchedVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india'));
      }
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      synthRef.current.speak(utterance);
    } catch (e) {
      console.warn('SpeechSynthesis error:', e);
    }
  }, [currentLang, speechLang]);

  const closeOverlay = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    setIsListening(false);
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsOpen(false);
    setTranscript('');
    setStatusText(t('voice_agent.tap_mic'));
  }, [t]);

  // ─── Fast-path: keyword-based navigation (instant, no network) ─────
  const tryKeywordNavigation = useCallback((text) => {
    const lowerText = text.toLowerCase().trim();

    // Language change voice commands
    if (lowerText.includes('marathi') || lowerText.includes('मराठी') || lowerText.includes('मराठीत')) {
      if (onLanguageChange) onLanguageChange('mr');
      else i18n.changeLanguage('mr');
      const confirmation = 'मराठी भाषा निवडली आहे. मी तुम्हाला कशी मदत करू?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return true;
    }
    if (lowerText.includes('hindi') || lowerText.includes('हिंदी') || lowerText.includes('हिन्दी')) {
      if (onLanguageChange) onLanguageChange('hi');
      else i18n.changeLanguage('hi');
      const confirmation = 'हिंदी भाषा चुनी गई है। मैं आपकी क्या सहायता कर सकता हूँ?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return true;
    }
    if (lowerText.includes('english') || lowerText.includes('अंग्रेजी') || lowerText.includes('इंग्रजी')) {
      if (onLanguageChange) onLanguageChange('en');
      else i18n.changeLanguage('en');
      const confirmation = 'English language selected. How can I help you?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return true;
    }

    // Navigation commands — expanded to cover all views with multilingual aliases
    const navRules = [
      {
        keywords: ['calculator', 'calculate', 'कैलकुलेटर', 'कैलकुलेट', 'कॅल्क्युलेटर', 'योजना', 'scheme calc'],
        target: 'calculator',
        speech: { mr: 'योजना कॅल्क्युलेटर उघडत आहे.', hi: 'योजना कैलकुलेटर खोला जा रहा है।', en: 'Opening the scheme calculator.' },
      },
      {
        keywords: ['report', 'feasibility', 'रिपोर्ट', 'अहवाल', 'व्यवहार्यता', 'प्रोजेक्ट', 'प्रकल्प', 'swot', 'business plan'],
        target: 'feasibility',
        speech: { mr: 'व्यवहार्यता अहवाल उघडत आहे.', hi: 'व्यवहार्यता रिपोर्ट खोली जा रही है।', en: 'Opening the business feasibility report.' },
      },
      {
        keywords: ['history', 'loan', 'इतिहास', 'कर्ज', 'लोन', 'किस्त', 'हप्ता', 'emi', 'repayment', 'repay'],
        target: 'history',
        speech: { mr: 'तुमचा कर्ज इतिहास उघडत आहे.', hi: 'आपका ऋण इतिहास खोला जा रहा है।', en: 'Opening your loan history.' },
      },
      {
        keywords: ['market', 'price', 'mandi', 'बाजार', 'मंडी', 'भाव', 'दर', 'दाम', 'crop price', 'soybean', 'cotton'],
        target: 'market',
        speech: { mr: 'थेट बाजार भाव उघडत आहे.', hi: 'लाइव मंडी भाव खोले जा रहे हैं।', en: 'Opening live market prices.' },
      },
      {
        keywords: ['weather', 'rain', 'मौसम', 'हवामान', 'बारिश', 'पाऊस', 'जोखिम', 'जोखीम', 'forecast', 'spray', 'insurance', 'बीमा', 'विमा'],
        target: 'weather',
        speech: { mr: 'हवामान आणि पीक जोखीम उघडत आहे.', hi: 'मौसम एवं फसल जोखिम पृष्ठ खोला जा रहा है।', en: 'Opening weather and crop risk.' },
      },
      {
        keywords: ['dashboard', 'home', 'डैशबोर्ड', 'डॅशबोर्ड', 'होम', 'मुख्य', 'main page', 'overview'],
        target: 'dashboard',
        speech: { mr: 'डॅशबोर्डवर जात आहे.', hi: 'डैशबोर्ड पर जाया जा रहा है।', en: 'Going to dashboard.' },
      },
      {
        keywords: ['settings', 'setting', 'सेटिंग', 'सेटिंग्ज', 'preference', 'profile', 'प्रोफाइल', 'भाषा बदला', 'भाषा बदलें'],
        target: 'settings',
        speech: { mr: 'सेटिंग्ज उघडत आहे.', hi: 'सेटिंग्स खोली जा रही हैं।', en: 'Opening settings.' },
      },
    ];

    for (const rule of navRules) {
      if (rule.keywords.some(k => lowerText.includes(k))) {
        onNavigate(rule.target);
        const moneyMatch = lowerText.match(/\b(\d{4,})\b/);
        if (moneyMatch && setMargin && rule.target === 'calculator') {
          setMargin(Number(moneyMatch[1]));
        }
        const speech = rule.speech[currentLang] || rule.speech.en;
        setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: speech }]);
        speak(speech);
        setTimeout(() => closeOverlay(), 2000);
        return true;
      }
    }

    return false; // No keyword match — fall through to LLM
  }, [onNavigate, setMargin, currentLang, onLanguageChange, speak, i18n, closeOverlay]);

  // ─── LLM-powered chat handler ─────────────────────────────────────
  const handleUserMessage = useCallback(async (text) => {
    if (!text || !text.trim()) return;

    // Try fast-path keyword navigation first (instant, no network needed)
    if (tryKeywordNavigation(text)) return;

    // Add user message immediately, show thinking indicator
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setIsThinking(true);
    setStatusText(currentLang === 'mr' ? 'विचार करत आहे...' : currentLang === 'hi' ? 'सोच रहा हूँ...' : 'Thinking...');

    try {
      // Build history from existing chat messages (exclude current)
      const history = chatMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10);

      const response = await sendChatMessage(text, history, currentLang, currentView || 'dashboard');

      // Add assistant reply
      setChatMessages(prev => [...prev, { role: 'assistant', text: response.reply }]);
      speak(response.reply);
      setStatusText(currentLang === 'mr' ? 'उत्तर दिले' : currentLang === 'hi' ? 'उत्तर दिया गया' : 'Answered');

      // Handle navigation intent from LLM
      if (response.navigate_to) {
        onNavigate(response.navigate_to);
        setTimeout(() => closeOverlay(), 2500);
      }

      // Update dynamic suggestions from LLM
      if (response.suggestions && response.suggestions.length > 0) {
        setDynamicSuggestions(response.suggestions);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = currentLang === 'mr'
        ? 'माफ करा, काही त्रुटी आली. कृपया पुन्हा प्रयत्न करा.'
        : currentLang === 'hi'
          ? 'क्षमा करें, कोई त्रुटि हुई। कृपया पुनः प्रयास करें।'
          : 'Sorry, something went wrong. Please try again.';
      setChatMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
    } finally {
      setIsThinking(false);
    }
  }, [chatMessages, currentLang, currentView, onNavigate, speak, closeOverlay, tryKeywordNavigation]);

  // Watch transcript for voice speech
  useEffect(() => {
    if (transcript && transcript.length > 3 && !transcript.includes('…')) {
      handleUserMessage(transcript);
    }
  }, [transcript, handleUserMessage]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isThinking]);

  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setStatusText(currentLang === 'mr' ? 'ऐकत आहे...' : currentLang === 'hi' ? 'सुन रहा हूँ...' : 'Listening...');
      try {
        recognitionRef.current.lang = speechLang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // Recognition might already be running
      }
    } else {
      setStatusText(currentLang === 'mr' ? 'व्हॉइस उपलब्ध नाही. चॅट वापरा.' : currentLang === 'hi' ? 'वॉइस उपलब्ध नहीं है। चैट करें।' : 'Speech recognition not available. Use Chat mode.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      setIsListening(false);
      setStatusText(t('voice_agent.tap_mic'));
    }
  };

  const toggleOverlay = () => {
    if (isOpen) {
      closeOverlay();
    } else {
      setMode('voice');
      setIsOpen(true);
      setTimeout(() => startListening(), 300);
    }
  };

  const handleSendChat = (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    handleUserMessage(msg);
  };

  // External event listeners
  useEffect(() => {
    const handleVoiceOpen = () => {
      setMode('voice');
      setIsOpen(true);
      setTimeout(() => startListening(), 300);
    };
    const handleChatOpen = (e) => {
      stopListening();
      setMode('chat');
      setIsOpen(true);
      const text = e?.detail?.text;
      if (text && typeof text === 'string' && text.trim()) {
        setTimeout(() => handleUserMessage(text), 80);
      }
    };

    window.addEventListener('open-voice-agent', handleVoiceOpen);
    window.addEventListener('open-chat-support', handleChatOpen);
    window.addEventListener('open-chat-with', handleChatOpen);
    return () => {
      window.removeEventListener('open-voice-agent', handleVoiceOpen);
      window.removeEventListener('open-chat-support', handleChatOpen);
      window.removeEventListener('open-chat-with', handleChatOpen);
    };
  }, [startListening, handleUserMessage]);

  // Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOverlay]);

  // Default multilingual quick suggestions (used when LLM hasn't provided any yet)
  const defaultSuggestions = currentLang === 'mr' ? [
    'सब्सिडी किती मिळेल?',
    'व्याजदर किती आहे?',
    'कर्जासाठी पात्रता काय?',
    'थेट बाजार भाव दाखवा'
  ] : currentLang === 'hi' ? [
    'सब्सिडी कितनी मिलेगी?',
    'ब्याज दर क्या है?',
    'ऋण के लिए पात्रता क्या है?',
    'लाइव मंडी भाव दिखाएं'
  ] : [
    'What subsidy is available?',
    'What is the interest rate?',
    'How to apply for a loan?',
    'Show live market prices'
  ];

  const suggestions = dynamicSuggestions.length > 0 ? dynamicSuggestions : defaultSuggestions;

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={toggleOverlay}
        className="fixed right-4 md:right-6 bottom-[84px] md:bottom-10 w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container hover:scale-105 transition-all duration-200 z-40"
        aria-label="Voice Assistant"
      >
        <span className="material-symbols-outlined text-[28px] md:text-[32px]">mic</span>
      </button>

      {/* Voice / Chat Agent Overlay */}
      <div 
        className={`fixed inset-0 bg-on-background/80 backdrop-blur-md z-[100] flex-col items-center justify-center p-4 md:p-6 transition-opacity duration-300 cursor-pointer ${isOpen ? 'opacity-100 flex' : 'opacity-0 hidden'}`} 
        id="voice-overlay"
        onClick={closeOverlay}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-surface-variant flex flex-col max-h-[90vh] cursor-default"
        >
          {/* Header */}
          <div className="p-4 md:p-6 bg-surface border-b border-surface-variant flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {mode === 'voice' ? 'mic' : 'support_agent'}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold truncate">
                  {mode === 'voice' ? t('voice_agent.voice_assistant') : t('voice_agent.chat_advisor')}
                </h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  {mode === 'voice' ? t('voice_agent.voice_desc') : (currentLang === 'mr' ? 'कोणताही प्रश्न विचारा · AI सहाय्यक' : currentLang === 'hi' ? 'कोई भी सवाल पूछें · AI सहायक' : 'Ask anything · AI-powered assistant')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Language Indicator in Bot Header */}
              <span className="px-2.5 py-1 rounded-lg bg-surface-container font-label-sm text-label-sm text-primary font-bold border border-outline-variant">
                {currentLang === 'mr' ? 'मराठी' : currentLang === 'hi' ? 'हिन्दी' : 'EN'}
              </span>

              {/* Mode toggle */}
              <div className="bg-surface-container rounded-xl p-1 flex items-center border border-outline-variant">
                <button
                  onClick={() => { setMode('voice'); setTimeout(() => startListening(), 200); }}
                  className={`px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm transition-colors flex items-center gap-1 ${
                    mode === 'voice' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">mic</span>
                  {t('voice_agent.voice')}
                </button>
                <button
                  onClick={() => { stopListening(); setMode('chat'); }}
                  className={`px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm transition-colors flex items-center gap-1 ${
                    mode === 'chat' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">chat</span>
                  {t('voice_agent.chat')}
                </button>
              </div>

              <button 
                onClick={closeOverlay}
                className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          {/* Body */}
          {mode === 'voice' ? (
            <div className="p-6 md:p-8 flex flex-col items-center justify-center space-y-6">
              <div className="relative my-4">
                {isListening && (
                  <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-75"></div>
                )}
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,105,72,0.4)] transition-all ${
                    isListening ? 'bg-error text-on-error scale-105' : 'bg-primary text-on-primary hover:scale-105'
                  }`}
                  aria-label={isListening ? 'Stop Listening' : 'Start Listening'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '52px' }}>
                    {isListening ? 'stop' : 'mic'}
                  </span>
                </button>
              </div>
              
              <div className="text-center">
                <h4 className="font-headline-md text-headline-md text-on-surface font-semibold">
                  {statusText}
                </h4>
                <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                  {isListening ? t('voice_agent.speak_now') : t('voice_agent.tap_to_speak')}
                </p>
              </div>

              <div className="w-full bg-surface border border-surface-variant rounded-2xl p-4 min-h-[90px] flex items-center justify-center text-center">
                <p className="font-body-md text-body-md text-on-surface italic">
                  {transcript ? `"${transcript}"` : (currentLang === 'mr' ? '"कोणताही प्रश्न विचारा किंवा पेज उघडण्यास सांगा"' : currentLang === 'hi' ? '"कोई भी सवाल पूछें या पेज खोलने को कहें"' : '"Ask any question or say a page name to navigate"')}
                </p>
              </div>

              {/* Quick pills */}
              <div className="w-full">
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 text-center font-medium">{t('voice_agent.quick_commands')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    t('nav.dashboard'),
                    t('nav.feasibility'),
                    t('nav.history'),
                    t('nav.market'),
                    t('nav.weather')
                  ].map((cmd, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleUserMessage(cmd)}
                      className="px-3.5 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-primary hover:text-on-primary transition-all font-label-sm text-label-sm border border-outline-variant font-medium"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 max-h-[360px]">
                {chatMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-primary text-on-primary rounded-tr-none' 
                          : 'bg-surface-container text-on-surface rounded-tl-none border border-surface-variant'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 rounded-tl-none bg-surface-container border border-surface-variant flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg animate-spin">progress_activity</span>
                      <span className="text-sm text-on-surface-variant italic">
                        {currentLang === 'mr' ? 'विचार करत आहे...' : currentLang === 'hi' ? 'सोच रहा हूँ...' : 'Thinking...'}
                      </span>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Multilingual Suggestions */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUserMessage(s)}
                    disabled={isThinking}
                    className="text-xs px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={currentLang === 'mr' ? 'कोणताही प्रश्न विचारा...' : currentLang === 'hi' ? 'कोई भी सवाल पूछें...' : 'Ask me anything...'}
                  disabled={isThinking}
                  className="flex-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-body-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isThinking}
                  className="px-5 py-3 rounded-xl bg-primary text-on-primary font-label-lg text-sm flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">{isThinking ? 'hourglass_empty' : 'send'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
