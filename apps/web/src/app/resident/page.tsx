'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Home,
  Receipt,
  User as UserIcon,
  LogOut,
  CreditCard,
  CheckCircle,
  Clock,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  phone: string;
  role: string;
  houses: Array<{
    id: string;
    block: string;
    houseNumber: string;
    type: string;
  }>;
}

export default function ResidentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOME' | 'PAYMENTS' | 'PROFILE'>('HOME');

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const primaryHouse = user?.houses?.[0];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">ColonyDeposit</h1>
              <p className="text-[11px] text-slate-500">Greenwood Palms RWA</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Resident Portal
            </span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1 text-xs text-slate-600 hover:text-red-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto px-4 py-6 flex-1">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-blue-200 font-semibold">
                Welcome back
              </span>
              <h2 className="text-xl font-bold mt-0.5">{user?.name}</h2>
              <p className="text-xs text-blue-100 mt-1">
                {primaryHouse
                  ? `Flat ${primaryHouse.block}-${primaryHouse.houseNumber} (${primaryHouse.type.replace('_', ' ')})`
                  : 'Resident Account'}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm px-4 py-3 rounded-xl border border-white/20 self-start sm:self-auto">
              <div className="text-[10px] text-blue-200 uppercase font-semibold">
                Security Deposit Due
              </div>
              <div className="text-xl font-bold mt-0.5">₹0.00</div>
              <div className="flex items-center space-x-1 text-[11px] text-emerald-300 mt-0.5">
                <CheckCircle className="h-3 w-3" />
                <span>All dues clear</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Cards (Desktop Multi-column / Mobile Single Column) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-start space-x-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Assigned Unit
              </h3>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {primaryHouse ? `Block ${primaryHouse.block} - ${primaryHouse.houseNumber}` : 'None'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Registered Resident</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-start space-x-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Payment Receipts
              </h3>
              <p className="text-base font-bold text-slate-900 mt-0.5">Instant Digital Slip</p>
              <p className="text-xs text-slate-500 mt-1">Ready to download (Module 4)</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-start space-x-4">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                UPI &amp; NetBanking
              </h3>
              <p className="text-base font-bold text-slate-900 mt-0.5">Razorpay Gateway</p>
              <p className="text-xs text-slate-500 mt-1">Integrated in Module 3</p>
            </div>
          </div>
        </div>

        {/* Security / RBAC Banner */}
        <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 flex items-center space-x-3 text-xs text-slate-700">
          <ShieldAlert className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div>
            <span className="font-semibold text-slate-900">Resident Data Isolation Active: </span>
            You are authenticated under role <span className="font-bold">RESIDENT</span>. Your session
            is restricted strictly to your own apartment dues and receipts.
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center justify-around px-4 z-30">
        <button
          onClick={() => setActiveTab('HOME')}
          className={`flex flex-col items-center space-y-1 text-xs ${
            activeTab === 'HOME' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </button>
        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`flex flex-col items-center space-y-1 text-xs ${
            activeTab === 'PAYMENTS' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <CreditCard className="h-5 w-5" />
          <span>Pay Due</span>
        </button>
        <button
          onClick={() => setActiveTab('PROFILE')}
          className={`flex flex-col items-center space-y-1 text-xs ${
            activeTab === 'PROFILE' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <UserIcon className="h-5 w-5" />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}

