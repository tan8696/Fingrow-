import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Built-in rural enterprise advisory Q&A for offline/instant responses
const KNOWLEDGE_BASE = [
  {
    keywords: ['subsidy', 'subsidies', 'maha-krushi', 'grant', 'government benefit'],
    answer: 'Under the Maha-Krushi Scheme and NABARD priority sector norms, agricultural enterprises qualify for a 25% capital subsidy (up to ₹5,00,000 backend credit). Additional subsidies for solar installations are also available this quarter.',
  },
  {
    keywords: ['poultry', 'chicken', 'organic poultry', 'broiler', 'feed'],
    answer: 'Organic poultry farming in the Vidarbha region has an 85% market viability score with high local feed availability and standard 18-month break-even. Organic eggs and meat command a 15-20% premium in nearby urban mandis.',
  },
  {
    keywords: ['interest', 'rate', 'emi', 'repayment', 'term loan'],
    answer: 'Priority sector agricultural term loans feature subsidized interest rates starting at 7.00% p.a. with repayment tenures up to 7 years (84 months) and an initial 6-month moratorium.',
  },
  {
    keywords: ['eligibility', 'documents', 'udyam', 'apply'],
    answer: 'Basic eligibility requires farmer/promoter margin equity of at least 15%, Aadhaar, land records (7/12 or lease), and Udyam micro-enterprise registration. You can apply directly through this portal.',
  },
  {
    keywords: ['market', 'price', 'mandi', 'sell'],
    answer: 'Current agricultural mandi prices show strong demand for organic produce. You can check daily live rates on the Market Prices tab.',
  },
];

function getAdvisoryAnswer(query) {
  const lower = query.toLowerCase();
  for (const item of KNOWLEDGE_BASE) {
    if (item.keywords.some(k => lower.includes(k))) {
      return item.answer;
    }
  }
  return `Thank you for your question about "${query}". In rural Maharashtra, priority sector agricultural lending provides up to 85% bank funding at 7.00% interest with state capital subsidies. You can adjust the project calculator or apply directly from your Feasibility Report.`;
}

export default function FloatingVoiceAgent({ onNavigate, setMargin }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('voice'); // 'voice' | 'chat'
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState(t('voice_agent.tap_mic'));
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: t('voice_agent.welcome') }
  ]);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const chatBottomRef = useRef(null);

  // Initialize Web Speech API recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // English (India) — supports Indian accent and Hindi-English

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += t + ' ';
          } else {
            interimTranscript += t;
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
          setStatusText('No speech detected. Please tap mic and try again.');
        } else if (event.error === 'not-allowed') {
          setStatusText('Microphone access not allowed. You can type in Chat mode.');
        } else {
          setStatusText(`Speech status: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  const speak = (text) => {
    if (synthRef.current) {
      try {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 1.0;
        synthRef.current.speak(utterance);
      } catch (e) {
        console.warn('SpeechSynthesis error:', e);
      }
    }
  };

  // Process voice or text command / question
  const handleUserMessage = useCallback((text) => {
    if (!text || !text.trim()) return;
    const lowerText = text.toLowerCase();

    // 1. Check for navigation commands
    if (lowerText.includes('calculator') || lowerText.includes('calculate')) {
      onNavigate('calculator');
      const moneyMatch = lowerText.match(/\b(\d{4,})\b/);
      if (moneyMatch && setMargin) {
        setMargin(Number(moneyMatch[1]));
      }
      speak('Opening the scheme calculator.');
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (lowerText.includes('report') || lowerText.includes('feasibility')) {
      onNavigate('feasibility');
      speak('Opening the business feasibility report.');
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (lowerText.includes('history') || (lowerText.includes('loan') && lowerText.includes('my'))) {
      onNavigate('history');
      speak('Opening your loan history.');
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (lowerText.includes('market') || lowerText.includes('price') || lowerText.includes('mandi')) {
      onNavigate('market');
      speak('Opening market prices.');
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (lowerText.includes('dashboard') || lowerText.includes('home')) {
      onNavigate('dashboard');
      speak('Going to dashboard.');
      setTimeout(() => closeOverlay(), 2000);
      return;
    }

    // 2. Otherwise provide intelligent agricultural/financial advisory answer
    const answer = getAdvisoryAnswer(text);
    setChatMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: answer }
    ]);
    speak(answer);
    setStatusText('Answered');
  }, [onNavigate, setMargin]);

  // Watch transcript for voice commands
  useEffect(() => {
    if (transcript && transcript.length > 4 && !transcript.includes('…')) {
      handleUserMessage(transcript);
    }
  }, [transcript, handleUserMessage]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setStatusText('Listening...');
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // Recognition already started or pending
      }
    } else {
      setStatusText('Speech recognition not available. Use Chat mode.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatusText(t('voice_agent.tap_mic'));
    }
  };

  const closeOverlay = () => {
    stopListening();
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsOpen(false);
    setTranscript('');
    setStatusText(t('voice_agent.tap_mic'));
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
      // Optional prefill: dispatch 'open-chat-with' with { text } to send a question.
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
  }, []);

  // Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={toggleOverlay}
        className="fixed right-6 bottom-24 md:bottom-10 w-16 h-16 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container hover:scale-105 transition-all duration-200 z-40"
        aria-label="Voice Assistant"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>mic</span>
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
                  {mode === 'voice' ? t('voice_agent.voice_desc') : t('voice_agent.chat_desc')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                  {isListening ? 'Speak now in English or Hindi...' : 'Tap the microphone icon to speak'}
                </p>
              </div>

              <div className="w-full bg-surface border border-surface-variant rounded-2xl p-4 min-h-[90px] flex items-center justify-center text-center">
                <p className="font-body-md text-body-md text-on-surface italic">
                  {transcript ? `"${transcript}"` : t('voice_agent.example_commands')}
                </p>
              </div>

              {/* Quick pills */}
              <div className="w-full">
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 text-center font-medium">{t('voice_agent.quick_commands')}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[t('dashboard.calculator_nav'), t('dashboard.feasibility_nav'), t('dashboard.history_nav'), t('dashboard.market_nav'), t('dashboard.dashboard_nav')].map((cmd, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleUserMessage(cmd)}
                      className="px-3 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-primary hover:text-on-primary transition-all font-label-sm text-label-sm border border-outline-variant"
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
                <div ref={chatBottomRef} />
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[
                  'What subsidy is available?',
                  'What is the interest rate?',
                  'How to apply for loan?',
                  'Open Scheme Calculator',
                ].map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUserMessage(s)}
                    className="text-xs px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container transition-colors"
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
                  placeholder={t('voice_agent.chat_placeholder')}
                  className="flex-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-body-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-5 py-3 rounded-xl bg-primary text-on-primary font-label-lg text-sm flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
