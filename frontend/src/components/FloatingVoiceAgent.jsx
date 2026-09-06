import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Built-in rural enterprise advisory Q&A for offline/instant multilingual responses
const MULTILINGUAL_KNOWLEDGE_BASE = [
  {
    category: 'subsidy',
    keywords: [
      'subsidy', 'subsidies', 'maha-krushi', 'grant', 'government benefit', 'scheme',
      'सब्सिडी', 'अनुदान', 'योजना', 'सरकारी लाभ', 'महा-कृषि', 'नाबार्ड',
      'सबसिडी', 'अनुदान', 'योजना', 'सरकारी योजना', 'महा-कृषी', 'नाबार्ड'
    ],
    answers: {
      en: 'Under the Maha-Krushi Scheme and NABARD priority sector norms, agricultural enterprises qualify for a 25% to 35% capital subsidy (up to ₹5,00,000 backend credit). Solar pump installations also receive a 30% PM-KUSUM subsidy.',
      hi: 'महा-कृषि योजना और नाबार्ड प्राथमिक क्षेत्र नियमों के तहत, कृषि उद्यमों को 25% से 35% पूंजीगत सब्सिडी (₹5,00,000 तक बैकएंड क्रेडिट) मिलती है। इसके अलावा सोलर पंप स्थापना पर पीएम-कुसुम के तहत 30% सब्सिडी भी उपलब्ध है।',
      mr: 'महा-कृषी योजना आणि नाबार्ड प्राधान्य क्षेत्र नियमांनुसार, कृषी उपक्रमांना 25% ते 35% भांडवली सबसिडी (₹5,00,000 पर्यंत बॅकएंड क्रेडिट) मिळते. तसेच सोलर पंप बसवण्यासाठी पीएम-कुसुम अंतर्गत 30% सबसिडी उपलब्ध आहे.'
    }
  },
  {
    category: 'poultry',
    keywords: [
      'poultry', 'chicken', 'organic poultry', 'broiler', 'feed', 'egg',
      'पोल्ट्री', 'मुर्गी', 'कुक्कुट', 'ब्रायलर', 'अंडा', 'चारा',
      'पोल्ट्री', 'कोंबडी', 'कुक्कुटपालन', 'ब्रॉयलर', 'अंडी', 'खाद्य'
    ],
    answers: {
      en: 'Organic poultry farming in Vidarbha has an 85% market viability score with high local feed availability and an 18-month break-even period. Country eggs and organic meat command a 15-20% premium in nearby mandis.',
      hi: 'विदर्भ में जैविक पोल्ट्री फार्मिंग की बाजार व्यवहार्यता 85% है। स्थानीय स्तर पर सस्ता दाना उपलब्ध है और 18 महीने में लागत वसूल हो जाती है। देशी अंडों और मांस पर नजदीकी मंडियों में 15-20% अधिक मूल्य मिलता है।',
      mr: 'विदर्भात सेंद्रिय कुक्कुटपालनाचा व्यवहार्यता दर 85% आहे. स्थानिक खाद्य मुबलक असून 18 महिन्यांत नफा सुरू होतो. गावरान अंडी आणि मांसाला जवळच्या बाजार समित्यांमध्ये 15-20% जादा दर मिळतो.'
    }
  },
  {
    category: 'interest',
    keywords: [
      'interest', 'rate', 'emi', 'repayment', 'term loan', 'kcc',
      'ब्याज', 'दर', 'ईएमआई', 'किस्त', 'पुनर्भुगतान', 'टर्म लोन', 'केसीसी',
      'व्याज', 'दर', 'ईएमआय', 'हप्ता', 'परतफेड', 'टर्म लोन', 'केसीसी'
    ],
    answers: {
      en: 'Priority sector agricultural term loans feature subsidized interest rates starting at 7.00% p.a. with tenures up to 7 years (84 months) and an initial 6-month moratorium. KCC loans offer 4.00% interest with prompt repayment subvention.',
      hi: 'प्राथमिकता क्षेत्र कृषि टर्म लोन 7.00% वार्षिक रियायती ब्याज दर पर 7 साल (84 महीने) की अवधि और 6 महीने के मोराटोरियम के साथ मिलते हैं। किसान क्रेडिट कार्ड (KCC) पर समय पर भुगतान करने पर ब्याज दर मात्र 4.00% है।',
      mr: 'प्राधान्य क्षेत्र कृषी मुदत कर्ज 7.00% सवलतीच्या वार्षिक व्याजदराने 7 वर्षे (84 महिने) मुदत आणि सुरुवातीच्या 6 महिन्यांच्या सवलतीसह (मोरोटोरियम) मिळते. KCC कर्जावर वेळेत परतफेड केल्यास केवळ 4.00% व्याजदर लागतो.'
    }
  },
  {
    category: 'eligibility',
    keywords: [
      'eligibility', 'documents', 'udyam', 'apply', '7/12', 'aadhaar', 'pan',
      'पात्रता', 'दस्तावेज', 'कागजात', 'उद्यम', 'आवेदन', 'सातबारा', 'आधार',
      'पात्रता', 'कागदपत्रे', 'दस्तऐवज', 'उद्यम', 'अर्ज', 'सातबारा', 'आधार', '८अ'
    ],
    answers: {
      en: 'Basic eligibility requires farmer margin equity of 10% to 15%, Aadhaar card, land records (7/12 extract or registered lease), and Udyam micro-enterprise registration. You can apply directly through our FinGrow portal.',
      hi: 'पात्रता के लिए किसान की 10% से 15% मार्जिन पूंजी, आधार कार्ड, भूमि अभिलेख (7/12 नकल या पट्टा) और उद्यम पंजीकरण आवश्यक है। आप सीधे इस फिनग्रो पोर्टल से ऋण आवेदन जमा कर सकते हैं।',
      mr: 'पात्रतेसाठी शेतकऱ्याचे 10% ते 15% स्वतःचे भांडवल, आधार कार्ड, जमिनीचा सातबारा उतारा (किंवा भाडेकरार) आणि उद्यम नोंदणी आवश्यक आहे. तुम्ही या फिनग्रो पोर्टलवरून थेट अर्ज करू शकता.'
    }
  },
  {
    category: 'market',
    keywords: [
      'market', 'price', 'mandi', 'sell', 'soybean', 'cotton', 'tur', 'rate',
      'बाजार', 'मंडी', 'भाव', 'दाम', 'सोयाबीन', 'कपास', 'तूर', 'कीमत',
      'बाजार', 'मंडी', 'भाव', 'दर', 'सोयाबीन', 'कापूस', 'तूर', 'किंमत'
    ],
    answers: {
      en: 'Current APMC mandi prices: Soybean is trading at ₹4,820/quintal, Cotton at ₹6,800/quintal, and Tur Dal at ₹10,400/quintal in Maharashtra mandis with steady-to-high demand.',
      hi: 'वर्तमान APMC मंडी भाव: महाराष्ट्र की मंडियों में सोयाबीन ₹4,820/क्विंटल, कपास ₹6,800/क्विंटल और तूर दाल ₹10,400/क्विंटल पर स्थिर एवं अच्छी मांग में हैं। लाइव भाव मंडी टैब में देखें।',
      mr: 'सध्याचे कृषी उत्पन्न बाजार दर: महाराष्ट्रातील बाजारात सोयाबीन ₹4,820/क्विंटल, कापूस ₹6,800/क्विंटल आणि तूर डाळ ₹10,400/क्विंटलवर स्थिर असून मागणी चांगली आहे. थेट दर बाजार भाव टॅबमध्ये पहा.'
    }
  },
  {
    category: 'weather',
    keywords: [
      'weather', 'rain', 'climate', 'pest', 'disease', 'irrigation',
      'मौसम', 'बारिश', 'वर्षा', 'कीट', 'रोग', 'सिंचाई',
      'हवामान', 'पाऊस', 'कीड', 'रोग', 'सिंचन', 'पाणी'
    ],
    answers: {
      en: 'Weather update for Vidarbha: Humidity is around 68% with clear to scattered clouds. Favorable conditions for organic crop growth. Keep proactive drainage checks during monsoon cycles.',
      hi: 'विदर्भ का मौसम पूर्वानुमान: आर्द्रता 68% और आंशिक बादल छाए रहने की संभावना है। जैविक फसलों और बागवानी के लिए मौसम अनुकूल है। अधिक जानकारी के लिए मौसम एवं फसल जोखिम पृष्ठ देखें।',
      mr: 'विदर्भाचा हवामान अंदाज: आर्द्रता 68% असून हलके ढगाळ वातावरण आहे. सेंद्रिय पिके व भाजीपाल्यासाठी हवामान अनुकूल आहे. अधिक तपशीलासाठी हवामान व पीक जोखीम टॅब तपासा.'
    }
  }
];

function getMultilingualAdvisoryAnswer(query, lang = 'en') {
  const lower = query.toLowerCase();
  for (const item of MULTILINGUAL_KNOWLEDGE_BASE) {
    if (item.keywords.some(k => lower.includes(k.toLowerCase()))) {
      return item.answers[lang] || item.answers.en;
    }
  }
  if (lang === 'hi') {
    return `आपके प्रश्न "${query}" के लिए धन्यवाद। ग्रामीण विदर्भ में, कृषि उद्यमों के लिए 7.00% रियायती ब्याज दर पर 85% से 90% तक बैंक ऋण और राज्य पूंजी सब्सिडी उपलब्ध है। आप योजना कैलकुलेटर से तुरंत पात्रता देख सकते हैं या अपनी व्यवहार्यता रिपोर्ट से सीधे आवेदन कर सकते हैं।`;
  } else if (lang === 'mr') {
    return `तुमच्या "${query}" या प्रश्नाबद्दल धन्यवाद. ग्रामीण विदर्भामध्ये, कृषी आणि सूक्ष्म उपक्रमांसाठी 7.00% सवलतीच्या व्याजदराने 85% ते 90% पर्यंत बँक कर्ज आणि राज्य भांडवली सबसिडी उपलब्ध आहे. तुम्ही योजना कॅल्क्युलेटरवरून त्वरित पात्रता तपासू शकता किंवा अहवालावरून थेट अर्ज करू शकता.`;
  }
  return `Thank you for your question about "${query}". In rural Maharashtra, priority sector agricultural lending provides up to 85-90% bank funding at 7.00% interest with state capital subsidies. You can adjust the project calculator or apply directly from your Feasibility Report.`;
}

export default function FloatingVoiceAgent({ onNavigate, setMargin, language, onLanguageChange }) {
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

  // Process voice or text command / question
  const handleUserMessage = useCallback((text) => {
    if (!text || !text.trim()) return;
    const lowerText = text.toLowerCase().trim();

    // 1. Language change voice commands
    if (lowerText.includes('marathi') || lowerText.includes('मराठी') || lowerText.includes('मराठीत')) {
      if (onLanguageChange) onLanguageChange('mr');
      else i18n.changeLanguage('mr');
      const confirmation = 'मराठी भाषा निवडली आहे. मी तुम्हाला कशी मदत करू?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return;
    }
    if (lowerText.includes('hindi') || lowerText.includes('हिंदी') || lowerText.includes('हिन्दी')) {
      if (onLanguageChange) onLanguageChange('hi');
      else i18n.changeLanguage('hi');
      const confirmation = 'हिंदी भाषा चुनी गई है। मैं आपकी क्या सहायता कर सकता हूँ?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return;
    }
    if (lowerText.includes('english') || lowerText.includes('अंग्रेजी') || lowerText.includes('इंग्रजी')) {
      if (onLanguageChange) onLanguageChange('en');
      else i18n.changeLanguage('en');
      const confirmation = 'English language selected. How can I help you?';
      setChatMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: confirmation }]);
      speak(confirmation);
      return;
    }

    // 2. Navigation commands in English, Hindi, and Marathi
    const isCalc = ['calculator', 'calculate', 'कैलकुलेटर', 'कैलकुलेट', 'कॅल्क्युलेटर', 'योजना'].some(k => lowerText.includes(k));
    const isReport = ['report', 'feasibility', 'रिपोर्ट', 'अहवाल', 'व्यवहार्यता', 'प्रोजेक्ट', 'प्रकल्प'].some(k => lowerText.includes(k));
    const isHistory = ['history', 'loan', 'इतिहास', 'कर्ज', 'लोन', 'किस्त', 'हप्ता'].some(k => lowerText.includes(k));
    const isMarket = ['market', 'price', 'mandi', 'बाजार', 'मंडी', 'भाव', 'दर', 'दाम'].some(k => lowerText.includes(k));
    const isWeather = ['weather', 'rain', 'मौसम', 'हवामान', 'बारिश', 'पाऊस', 'जोखिम', 'जोखीम'].some(k => lowerText.includes(k));
    const isHome = ['dashboard', 'home', 'डैशबोर्ड', 'डॅशबोर्ड', 'होम', 'मुख्य'].some(k => lowerText.includes(k));

    if (isCalc) {
      onNavigate('calculator');
      const moneyMatch = lowerText.match(/\b(\d{4,})\b/);
      if (moneyMatch && setMargin) setMargin(Number(moneyMatch[1]));
      const speech = currentLang === 'mr' ? 'योजना कॅल्क्युलेटर उघडत आहे.' : currentLang === 'hi' ? 'योजना कैलकुलेटर खोला जा रहा है।' : 'Opening the scheme calculator.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (isReport) {
      onNavigate('feasibility');
      const speech = currentLang === 'mr' ? 'व्यवहार्यता अहवाल उघडत आहे.' : currentLang === 'hi' ? 'व्यवहार्यता रिपोर्ट खोली जा रही है।' : 'Opening the business feasibility report.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (isHistory) {
      onNavigate('history');
      const speech = currentLang === 'mr' ? 'तुमचा कर्ज इतिहास उघडत आहे.' : currentLang === 'hi' ? 'आपका ऋण इतिहास खोला जा रहा है।' : 'Opening your loan history.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (isMarket) {
      onNavigate('market');
      const speech = currentLang === 'mr' ? 'थेट बाजार भाव उघडत आहे.' : currentLang === 'hi' ? 'लाइव मंडी भाव खोले जा रहे हैं।' : 'Opening live market prices.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (isWeather) {
      onNavigate('weather');
      const speech = currentLang === 'mr' ? 'हवामान आणि पीक जोखीम उघडत आहे.' : currentLang === 'hi' ? 'मौसम एवं फसल जोखिम पृष्ठ खोला जा रहा है।' : 'Opening weather and crop risk.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    } else if (isHome) {
      onNavigate('dashboard');
      const speech = currentLang === 'mr' ? 'डॅशबोर्डवर जात आहे.' : currentLang === 'hi' ? 'डैशबोर्ड पर जाया जा रहा है।' : 'Going to dashboard.';
      speak(speech);
      setTimeout(() => closeOverlay(), 2000);
      return;
    }

    // 3. Multilingual Advisory Q&A response
    const answer = getMultilingualAdvisoryAnswer(text, currentLang);
    setChatMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: answer }
    ]);
    speak(answer);
    setStatusText(currentLang === 'mr' ? 'उत्तर दिले' : currentLang === 'hi' ? 'उत्तर दिया गया' : 'Answered');
  }, [onNavigate, setMargin, currentLang, onLanguageChange, speak, i18n, closeOverlay]);

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
  }, [chatMessages]);

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

  // Multilingual quick suggestions for Chat mode
  const suggestions = currentLang === 'mr' ? [
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
    'How to apply for loan?',
    'Show live market prices'
  ];

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
                  {mode === 'voice' ? t('voice_agent.voice_desc') : t('voice_agent.chat_desc')}
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
                  {transcript ? `"${transcript}"` : t('voice_agent.example_commands')}
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
                <div ref={chatBottomRef} />
              </div>

              {/* Multilingual Suggestions */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {suggestions.map((s, idx) => (
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
