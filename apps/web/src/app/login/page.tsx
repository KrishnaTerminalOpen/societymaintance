'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  KeyRound,
  Sparkles,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  // Step state: 'PHONE' | 'OTP'
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');

  // Form inputs
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Async & UI states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  // 30-second resend cooldown timer
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Handle phone input formatting (clean digits only)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 10) {
      setPhone(raw);
      setErrorMessage(null);
    }
  };

  // Quick-fill test user helper for dev
  const handleQuickFill = (samplePhone: string) => {
    setPhone(samplePhone);
    setErrorMessage(null);
  };

  // Request OTP from backend
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (phone.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const fullPhone = `+91${phone}`;
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to send OTP.');
        if (data.cooldownSeconds) {
          setCooldown(data.cooldownSeconds);
        }
        return;
      }

      setStep('OTP');
      setCooldown(data.cooldownSeconds || 30);
      setSuccessMessage('OTP sent to +91 ' + phone);
      setDevOtpCode(data.devOtp || null);
      setAttemptsLeft(3);

      // Auto-focus first OTP input box on next render
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch {
      setErrorMessage('Network error occurred. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-advance OTP box typing
  const handleOtpBoxChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    // Support pasting full 6 digits
    if (clean.length > 1) {
      const pasted = clean.slice(0, 6).split('');
      const newOtp = [...otp];
      pasted.forEach((char, i) => {
        newOtp[i] = char;
      });
      setOtp(newOtp);
      const nextFocus = Math.min(pasted.length, 5);
      otpRefs.current[nextFocus]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = clean.slice(-1);
    setOtp(newOtp);

    // Auto-advance to next box
    if (index < 5 && clean) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP submission
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setErrorMessage('Please enter all 6 digits of the OTP.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const fullPhone = `+91${phone}`;
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp: otpString }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Invalid OTP code.');
        if (typeof data.attemptsLeft === 'number') {
          setAttemptsLeft(data.attemptsLeft);
        }
        return;
      }

      setSuccessMessage('Verification successful! Redirecting...');

      // Redirect to returnUrl or role-specific portal
      const destination = returnUrl || data.redirectUrl || '/resident';
      router.push(destination);
    } catch {
      setErrorMessage('Network error occurred during verification.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 mb-3">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          ColonyDeposit
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Residential Security Deposit Portal
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 sm:p-8">
        {step === 'PHONE' ? (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Sign in with Mobile</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your 10-digit registered phone number. We will send a secure 6-digit OTP.
              </p>
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <div className="relative flex rounded-xl border border-slate-300 shadow-sm focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 bg-white overflow-hidden transition-all">
                  <span className="inline-flex items-center px-3 text-sm font-semibold text-slate-500 bg-slate-50 border-r border-slate-200">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="98765 43210"
                    className="w-full px-3 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none"
                    autoFocus
                  />
                  <div className="pr-3 flex items-center pointer-events-none text-slate-400">
                    <Smartphone className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="rounded-xl bg-red-50 p-3 flex items-start space-x-2 text-xs text-red-700 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={phone.length !== 10 || isLoading}
                className="w-full mt-2 flex items-center justify-center space-x-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="h-4 w-4 animate-spin" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Continue with OTP</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick-Fill Dev Accounts Panel */}
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-500 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Quick Test Accounts (Seed Data)</span>
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill('9800000001')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-slate-700">Col. Rajeshwar Bakshi</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
                    SUPER ADMIN
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('9800000002')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-slate-700">Sunita Ramanathan</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                    ADMIN
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('9811100001')}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/60 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-slate-700">Aarav Verma (Flat A-101)</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                    RESIDENT
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Step 2: OTP Verification */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => {
                  setStep('PHONE');
                  setOtp(['', '', '', '', '', '']);
                  setErrorMessage(null);
                  setDevOtpCode(null);
                }}
                className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Change Number</span>
              </button>
              <div className="flex items-center space-x-1 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>5m expiry</span>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Enter Verification Code</h2>
              <p className="text-xs text-slate-500 mt-1">
                Sent to <span className="font-semibold text-slate-800">+91 {phone}</span>
              </p>
            </div>

            {/* Dev Mode OTP Banner */}
            {devOtpCode && (
              <div className="mb-5 rounded-xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900">
                <div className="flex items-center space-x-1.5 font-semibold text-amber-800 mb-1">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  <span>Dev Mode OTP Code</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-bold tracking-widest text-amber-950 bg-white/70 px-2 py-0.5 rounded border border-amber-300">
                    {devOtpCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const digits = devOtpCode.split('');
                      setOtp(digits);
                    }}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Auto-fill Code
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {/* 6 Digit Inputs */}
              <div className="flex justify-between space-x-2">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    type="tel"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none bg-white text-slate-900 shadow-sm transition-all"
                  />
                ))}
              </div>

              {/* Attempts counter & Cooldown alert */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {attemptsLeft !== null && (
                    <span className={attemptsLeft <= 1 ? 'text-red-600 font-medium' : ''}>
                      {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} remaining
                    </span>
                  )}
                </span>

                {cooldown > 0 ? (
                  <span className="text-slate-400">
                    Resend in <span className="font-semibold text-slate-600">{cooldown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={isLoading}
                    className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="rounded-xl bg-red-50 p-3 flex items-start space-x-2 text-xs text-red-700 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Message */}
              {successMessage && !errorMessage && (
                <div className="rounded-xl bg-emerald-50 p-3 flex items-center space-x-2 text-xs text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={otp.join('').length !== 6 || isLoading}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="h-4 w-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Verify &amp; Sign In</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Security Footer Note */}
      <div className="mt-8 text-center text-xs text-slate-400 max-w-sm">
        Protected by rate limiting &amp; rotating session tokens. Colony security deposit platform.
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
