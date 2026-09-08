import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function KYCModal({ onClose, onKycComplete }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(1);
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAadhaarSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    // Mock validation: exactly 12 digits
    const cleaned = aadhaar.replace(/\D/g, '');
    if (cleaned.length !== 12) {
      setError(i18n.language === 'hi' ? 'कृपया 12 अंकों का आधार नंबर दर्ज करें' : i18n.language === 'mr' ? 'कृपया १२ अंकी आधार क्रमांक प्रविष्ट करा' : 'Please enter a valid 12-digit Aadhaar number');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(2);
    }, 1500);
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    // Mock validation: exactly 6 digits
    const cleaned = otp.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setError(i18n.language === 'hi' ? 'कृपया 6 अंकों का OTP दर्ज करें' : i18n.language === 'mr' ? 'कृपया ६ अंकी OTP प्रविष्ट करा' : 'Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(3);
    }, 1500);
  };

  const handleFinish = () => {
    onKycComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-on-background/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 transition-opacity animate-in">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-surface-variant relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="p-6 md:p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">
                {step === 3 ? 'verified' : 'badge'}
              </span>
            </div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold text-center">
              {step === 3 ? 'KYC Verified Successfully' : 'Complete Your e-KYC'}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant text-center mt-2">
              {step === 1 ? 'Enter your Aadhaar number to verify your identity.' :
               step === 2 ? 'Enter the OTP sent to your Aadhaar-linked mobile.' :
               'Your identity has been verified. You now have full access.'}
            </p>
          </div>

          {step === 1 && (
            <form onSubmit={handleAadhaarSubmit} className="space-y-4">
              <div>
                <label className="font-label-sm text-label-sm font-semibold text-on-surface-variant block mb-2">
                  Aadhaar Number
                </label>
                <input
                  type="text"
                  placeholder="0000 0000 0000"
                  value={aadhaar}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                    setAadhaar(formatted.substring(0, 14));
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-body-lg text-center tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              
              {error && <p className="font-label-sm text-label-sm text-error text-center">{error}</p>}

              <button
                type="submit"
                disabled={isLoading || aadhaar.length < 14}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow min-h-[48px] disabled:opacity-50"
              >
                {isLoading ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <label className="font-label-sm text-label-sm font-semibold text-on-surface-variant block mb-2">
                  6-Digit OTP
                </label>
                <input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-headline-md text-center tracking-[0.5em] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && <p className="font-label-sm text-label-sm text-error text-center">{error}</p>}

              <button
                type="submit"
                disabled={isLoading || otp.length < 6}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow min-h-[48px] disabled:opacity-50"
              >
                {isLoading ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : 'Verify OTP'}
              </button>
              
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full mt-2 text-primary font-label-sm text-label-sm text-center hover:underline"
              >
                Change Aadhaar Number
              </button>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center">
              <button
                onClick={handleFinish}
                className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow min-h-[48px]"
              >
                Continue to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
