'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Home,
  ShieldCheck,
  CreditCard,
  Receipt,
  FileSpreadsheet,
  Settings,
  LogOut,
  IndianRupee,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAdminProfile() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (data.user?.role !== 'ADMIN' && data.user?.role !== 'SUPER_ADMIN') {
          router.push('/resident');
          return;
        }
        setUser(data.user);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    loadAdminProfile();
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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar (≥ 768px) */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800">
        <div className="h-16 flex items-center space-x-3 px-6 border-b border-slate-800">
          <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">ColonyDeposit</h1>
            <p className="text-[10px] text-slate-400">Admin Console</p>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <a
            href="#"
            className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
          >
            <Home className="h-4 w-4" />
            <span>Dashboard</span>
          </a>
          <a
            href="#"
            className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            <span>Deposits &amp; Payments</span>
          </a>
          <a
            href="#"
            className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            <Users className="h-4 w-4" />
            <span>Resident Directory</span>
          </a>
          <a
            href="#"
            className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Audit Trail</span>
          </a>
          <a
            href="#"
            className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span>Colony Settings</span>
          </a>
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                {user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-900/40 hover:text-red-300 text-xs text-slate-400 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Administrative Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-slate-500">Colony:</span>
            <span className="text-xs font-bold text-slate-800">
              Greenwood Palms Resident Welfare Association
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search flat / resident..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 w-48 sm:w-64"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <button
              onClick={handleLogout}
              className="md:hidden text-xs text-red-600 p-2 font-medium"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Administrative Body */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* Header Row */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Security Deposit Overview</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Financial monitoring, online collections &amp; offline receipt approvals.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>RBAC Guard Active</span>
              </span>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Units
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">50 Houses</p>
              <p className="text-xs text-slate-500 mt-1">Blocks A, B, C &amp; D</p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Fully Paid Deposits
              </span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">25 Units</p>
              <p className="text-xs text-emerald-600 mt-1">Receipts generated</p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Partial / Pending
              </span>
              <p className="text-2xl font-bold text-blue-600 mt-1">20 Units</p>
              <p className="text-xs text-slate-500 mt-1">Installment in progress</p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Overdue Deposits
              </span>
              <p className="text-2xl font-bold text-red-600 mt-1">5 Units</p>
              <p className="text-xs text-red-600 mt-1">Notice eligible</p>
            </div>
          </div>

          {/* Seed Sample Deposits Table */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Recent Deposit Records</h3>
              <span className="text-xs text-slate-500">Showing sample seed data</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3">Flat / Unit</th>
                    <th className="px-6 py-3">Resident</th>
                    <th className="px-6 py-3">Amount Due</th>
                    <th className="px-6 py-3">Amount Paid</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900">Block A - 101</td>
                    <td className="px-6 py-3">Aarav Verma</td>
                    <td className="px-6 py-3">₹40,000</td>
                    <td className="px-6 py-3 text-emerald-600 font-semibold">₹40,000</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        PAID
                      </span>
                    </td>
                    <td className="px-6 py-3 text-blue-600 hover:underline cursor-pointer">
                      REC-2026-1001
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900">Block B - 202</td>
                    <td className="px-6 py-3">Shaurya Patel</td>
                    <td className="px-6 py-3">₹60,000</td>
                    <td className="px-6 py-3 text-blue-600 font-semibold">₹30,000</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                        PARTIAL
                      </span>
                    </td>
                    <td className="px-6 py-3 text-blue-600 hover:underline cursor-pointer">
                      REC-2026-1026
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900">Block C - 301</td>
                    <td className="px-6 py-3">Rohan Mehta</td>
                    <td className="px-6 py-3">₹80,000</td>
                    <td className="px-6 py-3 text-slate-400">₹0</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        PENDING
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400">-</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-semibold text-slate-900">Block D - 305</td>
                    <td className="px-6 py-3">Rahul Ghosh</td>
                    <td className="px-6 py-3">₹1,20,000</td>
                    <td className="px-6 py-3 text-red-600 font-semibold">₹0</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                        OVERDUE
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

