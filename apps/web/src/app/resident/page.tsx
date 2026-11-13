'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Home,
  CreditCard,
  Receipt,
  RotateCcw,
  Bell,
  User as UserIcon,
  LogOut,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  RotateCw,
  PlusCircle,
  Download,
  X,
  Phone,
} from 'lucide-react';
import { formatPaiseToINR } from '@colony/shared/edge';

type ResidentTab = 'DASHBOARD' | 'PAY_NOW' | 'HISTORY' | 'REFUNDS' | 'NOTIFICATIONS' | 'PROFILE';

export default function ResidentPortalPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ResidentTab>('DASHBOARD');

  // Pay Now sub-states: 'FORM' | 'SUCCESS' | 'FAILED' | 'PENDING_UPI'
  const [payScreenState, setPayScreenState] = useState<'FORM' | 'SUCCESS' | 'FAILED' | 'PENDING_UPI'>('FORM');
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [customAmountRupees, setCustomAmountRupees] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [lastPaymentResult, setLastPaymentResult] = useState<{
    paymentId?: string;
    receiptNumber?: string;
    excessRefunded?: number;
  } | null>(null);

  // Refund request modal state
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmountRupees, setRefundAmountRupees] = useState('');
  const [refundReason, setRefundReason] = useState('Moving out / Lease ended');
  const [refundError, setRefundError] = useState<string | null>(null);

  // Profile edit email
  const [emailInput, setEmailInput] = useState('');
  const [emailSavedSuccess, setEmailSavedSuccess] = useState(false);

  // ============================================================================
  // TanStack Query: Fetch Profile
  // ============================================================================
  const { data: profileData } = useQuery({
    queryKey: ['resident-profile'],
    queryFn: async () => {
      const res = await fetch('/api/resident/profile');
      if (res.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setEmailInput(data.profile.email || '');
      return data.profile;
    },
  });

  // ============================================================================
  // TanStack Query: Fetch Dashboard & Active Deposit
  // ============================================================================
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['resident-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/resident/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard data');
      return res.json();
    },
  });

  // ============================================================================
  // TanStack Query: Fetch Payments History
  // ============================================================================
  const { data: paymentsData, isLoading: isPaymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['resident-payments'],
    queryFn: async () => {
      const res = await fetch('/api/resident/payments');
      if (!res.ok) throw new Error('Failed to load payments history');
      return res.json();
    },
  });

  // ============================================================================
  // TanStack Query: Fetch Refunds & Tracker
  // ============================================================================
  const { data: refundsData, isLoading: isRefundsLoading } = useQuery({
    queryKey: ['resident-refunds'],
    queryFn: async () => {
      const res = await fetch('/api/resident/refunds');
      if (!res.ok) throw new Error('Failed to load refunds');
      return res.json();
    },
  });

  // ============================================================================
  // TanStack Query: Fetch Notifications
  // ============================================================================
  const { data: notifData, isLoading: isNotifLoading } = useQuery({
    queryKey: ['resident-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/resident/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
  });

  // Real-Time Server-Sent Events (SSE) for Resident Updates
  React.useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events?channel=resident');

      es.addEventListener('PAYMENT_RECEIVED', () => {
        queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['resident-payments'] });
        queryClient.invalidateQueries({ queryKey: ['resident-notifications'] });
      });

      es.addEventListener('PAYMENT_UPDATED', () => {
        queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['resident-payments'] });
        queryClient.invalidateQueries({ queryKey: ['resident-notifications'] });
      });

      es.addEventListener('REFUND_PROCESSED', () => {
        queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['resident-refunds'] });
        queryClient.invalidateQueries({ queryKey: ['resident-notifications'] });
      });
    } catch {
      // EventSource not supported in environment
    }

    return () => {
      es?.close();
    };
  }, [queryClient]);

  // ============================================================================
  // Logout Mutation
  // ============================================================================
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      router.push('/login');
    },
  });

  // ============================================================================
  // Refund Request Mutation
  // ============================================================================
  const refundMutation = useMutation({
    mutationFn: async (payload: { paymentId: string; amount: number; reason: string }) => {
      const res = await fetch('/api/resident/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit refund request');
      return data;
    },
    onSuccess: () => {
      setIsRefundModalOpen(false);
      setRefundPaymentId('');
      setRefundAmountRupees('');
      setRefundError(null);
      queryClient.invalidateQueries({ queryKey: ['resident-refunds'] });
      queryClient.invalidateQueries({ queryKey: ['resident-notifications'] });
    },
    onError: (err: Error) => {
      setRefundError(err.message);
    },
  });

  // ============================================================================
  // Mark All Notifications Read Mutation
  // ============================================================================
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/resident/notifications', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resident-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
    },
  });

  // ============================================================================
  // Profile Update Email Mutation
  // ============================================================================
  const updateProfileMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/resident/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to update email');
      return res.json();
    },
    onSuccess: () => {
      setEmailSavedSuccess(true);
      setTimeout(() => setEmailSavedSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['resident-profile'] });
    },
  });

  // ============================================================================
  // Razorpay Checkout Execution
  // ============================================================================
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const handleExecutePayment = async () => {
    if (!dashboardData?.deposit) return;
    setPaymentError(null);
    setIsProcessingPayment(true);

    const remainingPaise = BigInt(dashboardData.deposit.remainingBalancePaise);

    let requestedPaise: number | undefined;
    if (paymentType === 'PARTIAL') {
      const parsed = parseFloat(customAmountRupees);
      if (isNaN(parsed) || parsed < 1000) {
        setPaymentError('Minimum partial payment is ₹1,000.');
        setIsProcessingPayment(false);
        return;
      }
      requestedPaise = Math.round(parsed * 100);
      if (BigInt(requestedPaise) > remainingPaise) {
        setPaymentError(`Amount cannot exceed remaining balance of ${formatPaiseToINR(remainingPaise)}.`);
        setIsProcessingPayment(false);
        return;
      }
    }

    const idempotencyKey = `idemp_res_${dashboardData.deposit.id}_${Date.now()}`;

    try {
      // 1. Create order on server
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositId: dashboardData.deposit.id,
          requestedAmountPaise: requestedPaise,
          idempotencyKey,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        setPaymentError(orderData.error || orderData.message || 'Failed to initialize payment.');
        setPayScreenState('FAILED');
        setIsProcessingPayment(false);
        return;
      }

      // Check for dev/mock mode
      const isMock = orderData.orderId.startsWith('order_mock_');

      if (isMock) {
        // Dev simulator
        setTimeout(async () => {
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: orderData.orderId,
                razorpayPaymentId: `pay_mock_${Date.now()}`,
                razorpaySignature: 'valid_mock_signature',
                idempotencyKey,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok) {
              setLastPaymentResult(verifyData);
              setPayScreenState('SUCCESS');
              queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['resident-payments'] });
            } else {
              setPayScreenState('PENDING_UPI');
            }
          } catch {
            setPayScreenState('PENDING_UPI');
          } finally {
            setIsProcessingPayment(false);
          }
        }, 1200);
        return;
      }

      // Live Razorpay SDK checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency || 'INR',
        name: 'ColonyDeposit',
        description: `Deposit - Unit ${dashboardData.house.block}-${dashboardData.house.houseNumber}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                idempotencyKey,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok) {
              setLastPaymentResult(verifyData);
              setPayScreenState('SUCCESS');
              queryClient.invalidateQueries({ queryKey: ['resident-dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['resident-payments'] });
            } else {
              setPayScreenState('PENDING_UPI');
            }
          } catch {
            setPayScreenState('PENDING_UPI');
          } finally {
            setIsProcessingPayment(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessingPayment(false);
          },
        },
        prefill: {
          name: profileData?.name,
          contact: profileData?.phone,
        },
        theme: {
          color: '#2563eb',
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        setPaymentError(resp.error.description || 'Payment was declined by your UPI provider.');
        setPayScreenState('FAILED');
        setIsProcessingPayment(false);
      });
      rzp.open();
    } catch (err: any) {
      setPaymentError(err.message || 'Payment initiation failed.');
      setPayScreenState('FAILED');
      setIsProcessingPayment(false);
    }
  };

  // Helper status badge styler
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            PAID
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="h-3.5 w-3.5 mr-1 text-amber-600" />
            PARTIAL
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="h-3.5 w-3.5 mr-1 text-red-600" />
            OVERDUE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="h-3.5 w-3.5 mr-1 text-amber-600" />
            PENDING
          </span>
        );
    }
  };

  const remainingBalancePaise = dashboardData?.deposit
    ? BigInt(dashboardData.deposit.remainingBalancePaise)
    : 0n;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-24 md:pb-0">
      {/* ========================================================================
          DESKTOP SIDEBAR (≥ 768px)
      ======================================================================== */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 min-h-screen sticky top-0">
        <div className="h-16 flex items-center space-x-3 px-6 border-b border-slate-800">
          <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">ColonyDeposit</h1>
            <p className="text-[10px] text-slate-400">Resident Portal</p>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'DASHBOARD'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Home className="h-4 w-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('PAY_NOW');
              setPayScreenState('FORM');
            }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'PAY_NOW'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>Pay Dues</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'HISTORY'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Payment History</span>
          </button>

          <button
            onClick={() => setActiveTab('REFUNDS')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'REFUNDS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Refund Tracker</span>
          </button>

          <button
            onClick={() => setActiveTab('NOTIFICATIONS')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'NOTIFICATIONS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Bell className="h-4 w-4" />
              <span>Notifications</span>
            </div>
            {dashboardData?.unreadNotificationsCount > 0 && (
              <span className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                {dashboardData.unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'PROFILE'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            <span>My Profile</span>
          </button>
        </nav>

        {/* User Footer Profile */}
        <div className="p-4 border-t border-slate-800">
          <div className="mb-3">
            <p className="text-xs font-bold text-white truncate">{profileData?.name || 'Resident'}</p>
            <p className="text-[11px] text-slate-400">
              {profileData?.houses?.[0]
                ? `Unit ${profileData.houses[0].block}-${profileData.houses[0].houseNumber}`
                : 'Resident'}
            </p>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-950 hover:text-red-300 text-xs text-slate-300 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================
          MAIN CONTENT AREA (Mobile Single Column & Desktop Expanded)
      ======================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <div className="md:hidden h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Greenwood Palms RWA</h2>
              <p className="text-[10px] text-slate-500">Security Deposit Management</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('NOTIFICATIONS')}
              className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {dashboardData?.unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('PROFILE')}
              className="flex items-center space-x-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                {profileData?.name ? profileData.name.charAt(0) : 'R'}
              </div>
            </button>
          </div>
        </header>

        {/* Tab Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
          {/* ====================================================================
              1. TAB: DASHBOARD
          ==================================================================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {isDashboardLoading ? (
                /* Skeleton Loader */
                <div className="space-y-4 animate-pulse">
                  <div className="h-44 bg-slate-200 rounded-2xl"></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="h-28 bg-slate-200 rounded-xl"></div>
                    <div className="h-28 bg-slate-200 rounded-xl"></div>
                    <div className="h-28 bg-slate-200 rounded-xl"></div>
                  </div>
                </div>
              ) : dashboardError ? (
                /* Error State */
                <div className="p-8 text-center bg-white rounded-2xl border border-red-200 shadow-sm">
                  <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-900">Unable to load dashboard</h3>
                  <p className="text-xs text-slate-500 mt-1">Please check your network connection and retry.</p>
                  <button
                    onClick={() => refetchDashboard()}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
                  >
                    Retry Loading
                  </button>
                </div>
              ) : (
                <>
                  {/* Hero Balance & Dues Card */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 relative z-10">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs uppercase tracking-wider text-blue-200 font-bold">
                            Active Deposit Obligation
                          </span>
                          {dashboardData?.deposit && renderStatusBadge(dashboardData.deposit.status)}
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight">
                          {formatPaiseToINR(remainingBalancePaise)}
                        </h2>
                        <p className="text-xs text-blue-100 mt-1">
                          {remainingBalancePaise === 0n ? (
                            'You have fully satisfied your security deposit obligations.'
                          ) : (
                            <>
                              Due on{' '}
                              <span className="font-semibold text-white">
                                {dashboardData?.deposit?.dueDate
                                  ? new Date(dashboardData.deposit.dueDate).toLocaleDateString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : 'N/A'}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Prominent Action Button (Min 44px tap target) */}
                      {remainingBalancePaise > 0n && (
                        <button
                          onClick={() => {
                            setActiveTab('PAY_NOW');
                            setPayScreenState('FORM');
                          }}
                          className="h-12 px-6 rounded-xl bg-white text-blue-700 font-bold text-sm hover:bg-blue-50 transition-all shadow-lg flex items-center justify-center space-x-2 flex-shrink-0 self-start sm:self-auto"
                        >
                          <CreditCard className="h-5 w-5" />
                          <span>Pay Now with UPI</span>
                        </button>
                      )}
                    </div>

                    {/* Background Graphic Accents */}
                    <div className="absolute right-0 bottom-0 translate-x-8 translate-y-8 h-48 w-48 rounded-full bg-white/5 pointer-events-none"></div>
                  </div>

                  {/* 3 Metric Breakdown Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Total Amount Due
                      </span>
                      <p className="text-xl font-bold text-slate-900 mt-1">
                        {dashboardData?.deposit
                          ? formatPaiseToINR(BigInt(dashboardData.deposit.amountDuePaise))
                          : '₹0'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Assessed for unit</p>
                    </div>

                    <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Amount Paid So Far
                      </span>
                      <p className="text-xl font-bold text-emerald-600 mt-1">
                        {dashboardData?.deposit
                          ? formatPaiseToINR(BigInt(dashboardData.deposit.amountPaidPaise))
                          : '₹0'}
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">Verified &amp; Receipted</p>
                    </div>

                    <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Assigned Property
                      </span>
                      <p className="text-xl font-bold text-slate-900 mt-1">
                        {dashboardData?.house
                          ? `Flat ${dashboardData.house.block}-${dashboardData.house.houseNumber}`
                          : 'None'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {dashboardData?.house?.type?.replace('_', ' ') || 'Residential Unit'}
                      </p>
                    </div>
                  </div>

                  {/* Recent Payments Snapshot */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
                      <button
                        onClick={() => setActiveTab('HISTORY')}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                      >
                        <span>View All</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {dashboardData?.recentPayments?.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {dashboardData.recentPayments.map((p: any) => (
                          <div key={p.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  {formatPaiseToINR(BigInt(p.amountPaise))}
                                </span>
                                <span className="text-xs text-slate-500">• {p.method}</span>
                              </div>
                              <span className="text-[11px] text-slate-400">
                                {new Date(p.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>

                            <div className="flex items-center space-x-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.status === 'SUCCESS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : p.status === 'FAILED'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {p.status}
                              </span>

                              {p.receiptNumber && (
                                <a
                                  href={`/api/resident/receipts/${p.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-100 flex items-center space-x-1 font-medium"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Receipt</span>
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Friendly Empty State */
                      <div className="py-12 text-center">
                        <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-500 font-medium">No payments made yet.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ====================================================================
              2. TAB: PAY NOW (Distinct States: Form, Success, Failed, Pending)
          ==================================================================== */}
          {activeTab === 'PAY_NOW' && (
            <div className="max-w-xl mx-auto space-y-6">
              {/* SUCCESS SCREEN */}
              {payScreenState === 'SUCCESS' && (
                <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 text-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Payment Completed!</h3>
                  <p className="text-xs text-slate-600 mt-2">
                    Your payment was verified and credited directly to your deposit balance.
                  </p>

                  {lastPaymentResult?.receiptNumber && (
                    <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 inline-flex flex-col items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Official Receipt Number
                      </span>
                      <span className="font-mono text-sm font-bold text-blue-700 mt-0.5">
                        {lastPaymentResult.receiptNumber}
                      </span>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    {lastPaymentResult?.receiptNumber && (
                      <a
                        href={`/api/resident/receipts/${lastPaymentResult.receiptNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 px-5 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center justify-center space-x-2 hover:bg-slate-800"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download Receipt PDF</span>
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab('DASHBOARD');
                        setPayScreenState('FORM');
                      }}
                      className="h-11 px-5 rounded-xl bg-blue-600 text-white font-semibold text-xs flex items-center justify-center hover:bg-blue-700"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* FAILED SCREEN WITH RETRY */}
              {payScreenState === 'FAILED' && (
                <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 text-center animate-in fade-in duration-200">
                  <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Payment Failed</h3>
                  <p className="text-xs text-red-700 mt-2 max-w-sm mx-auto">
                    {paymentError || 'Your bank or UPI app declined the transaction. No funds were deducted.'}
                  </p>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => {
                        setPayScreenState('FORM');
                        setPaymentError(null);
                      }}
                      className="h-12 px-6 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center space-x-2 hover:bg-blue-700"
                    >
                      <RotateCw className="h-4 w-4" />
                      <span>Retry Payment</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('DASHBOARD')}
                      className="h-12 px-6 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center hover:bg-slate-200"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* PAYMENT PENDING (DELAYED UPI) */}
              {payScreenState === 'PENDING_UPI' && (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center animate-in fade-in duration-200">
                  <div className="h-16 w-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">Payment Awaiting Confirmation</h3>
                  <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto">
                    Your UPI transaction is being confirmed by your bank. Our automated background worker
                    polls the gateway and will credit your deposit as soon as confirmation arrives.
                  </p>

                  <button
                    onClick={() => {
                      setActiveTab('DASHBOARD');
                      setPayScreenState('FORM');
                    }}
                    className="mt-6 h-12 px-6 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
                  >
                    Got It, Check Dashboard
                  </button>
                </div>
              )}

              {/* DEFAULT FORM SCREEN */}
              {payScreenState === 'FORM' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Security Deposit Payment</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pay securely with UPI, NetBanking, Debit/Credit Card or Wallet.
                    </p>
                  </div>

                  {/* Balance Summary Box */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        Current Outstanding Balance
                      </span>
                      <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                        {formatPaiseToINR(remainingBalancePaise)}
                      </p>
                    </div>
                    {dashboardData?.deposit && renderStatusBadge(dashboardData.deposit.status)}
                  </div>

                  {/* Payment Type Selection */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">Payment Option</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentType('FULL')}
                        className={`h-12 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center ${
                          paymentType === 'FULL'
                            ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Pay Full Balance
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentType('PARTIAL')}
                        className={`h-12 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center ${
                          paymentType === 'PARTIAL'
                            ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Custom Partial Due
                      </button>
                    </div>
                  </div>

                  {/* Custom Partial Input */}
                  {paymentType === 'PARTIAL' && (
                    <div className="space-y-1.5 animate-in fade-in duration-150">
                      <label className="block text-xs font-medium text-slate-700">
                        Enter Partial Installment Amount (₹) - Min ₹1,000
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-3 text-base font-bold text-slate-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="1000"
                          step="100"
                          value={customAmountRupees}
                          onChange={(e) => setCustomAmountRupees(e.target.value)}
                          placeholder="e.g. 15000"
                          className="h-12 w-full pl-8 pr-4 text-base font-bold rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Alert */}
                  {paymentError && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-start space-x-2 border border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>{paymentError}</span>
                    </div>
                  )}

                  {/* Pay Button */}
                  <button
                    onClick={handleExecutePayment}
                    disabled={isProcessingPayment || remainingBalancePaise <= 0n}
                    className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RotateCw className="h-4 w-4 animate-spin" />
                        <span>Connecting to Gateway...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" />
                        <span>
                          Proceed with{' '}
                          {paymentType === 'FULL'
                            ? formatPaiseToINR(remainingBalancePaise)
                            : customAmountRupees
                              ? `₹${parseFloat(customAmountRupees).toLocaleString('en-IN')}`
                              : 'Payment'}
                        </span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center text-[11px] text-slate-400 flex items-center justify-center space-x-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>256-bit encrypted checkout powered by Razorpay</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              3. TAB: PAYMENT HISTORY & RECEIPT DOWNLOADS
          ==================================================================== */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Payment History</h3>
                  <p className="text-xs text-slate-500">Official records &amp; downloadable digital slips</p>
                </div>
                <button
                  onClick={() => refetchPayments()}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  title="Refresh"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              {isPaymentsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-16 bg-slate-200 rounded-xl"></div>
                  <div className="h-16 bg-slate-200 rounded-xl"></div>
                  <div className="h-16 bg-slate-200 rounded-xl"></div>
                </div>
              ) : paymentsData?.payments?.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {paymentsData.payments.map((p: any) => (
                    <div key={p.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-extrabold text-slate-900 text-base">
                            {formatPaiseToINR(BigInt(p.amountPaise))}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.status === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'FAILED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {p.depositTitle} • {p.method} • {p.houseLabel}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {new Date(p.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 self-end sm:self-auto">
                        {p.receipt ? (
                          <a
                            href={`/api/resident/receipts/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download Receipt</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No receipt slip</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Payments Recorded</h4>
                  <p className="text-xs text-slate-500 mt-1">Payments made through the portal will appear here.</p>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              4. TAB: REFUND REQUESTS & STATUS TRACKER
          ==================================================================== */}
          {activeTab === 'REFUNDS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Deposit Refunds &amp; Returns</h3>
                  <p className="text-xs text-slate-500">Submit move-out refund claims or track active requests</p>
                </div>
                <button
                  onClick={() => setIsRefundModalOpen(true)}
                  className="h-10 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 flex items-center space-x-1.5 shadow-sm"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Request Refund</span>
                </button>
              </div>

              {/* Status Tracker List */}
              {isRefundsLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-20 bg-slate-200 rounded-xl"></div>
                  <div className="h-20 bg-slate-200 rounded-xl"></div>
                </div>
              ) : refundsData?.refunds?.length > 0 ? (
                <div className="space-y-4">
                  {refundsData.refunds.map((r: any) => (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold">Refund Claim</span>
                          <p className="text-lg font-bold text-slate-900">
                            {formatPaiseToINR(BigInt(r.amountPaise))}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            r.status === 'PROCESSED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.status === 'PENDING' ? 'UNDER COMMITTEE REVIEW' : r.status}
                        </span>
                      </div>

                      <div className="pt-3 text-xs text-slate-600 space-y-1">
                        <p>
                          <span className="font-semibold text-slate-700">Reason:</span> {r.reason}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Submitted on {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {r.gatewayRefundId && ` • Gateway ID: ${r.gatewayRefundId}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <RotateCcw className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Refund Requests</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    When you move out or if an adjustment is required, you can submit a refund claim.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              5. TAB: NOTIFICATIONS
          ==================================================================== */}
          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Notifications</h3>
                  <p className="text-xs text-slate-500">Due reminders, receipts &amp; committee alerts</p>
                </div>
                {notifData?.notifications?.length > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Mark All as Read
                  </button>
                )}
              </div>

              {isNotifLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-16 bg-slate-200 rounded-xl"></div>
                  <div className="h-16 bg-slate-200 rounded-xl"></div>
                </div>
              ) : notifData?.notifications?.length > 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {notifData.notifications.map((n: any) => (
                    <div
                      key={n.id}
                      className={`p-4 flex items-start space-x-3 ${n.readAt ? 'bg-white' : 'bg-blue-50/50'}`}
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                          <span className="text-[10px] text-slate-400">
                            {new Date(n.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <Bell className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Notifications</h4>
                  <p className="text-xs text-slate-500 mt-1">You are all caught up!</p>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              6. TAB: PROFILE
          ==================================================================== */}
          {activeTab === 'PROFILE' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="flex items-center space-x-4 pb-6 border-b border-slate-100">
                  <div className="h-14 w-14 rounded-full bg-blue-600 text-white font-extrabold text-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                    {profileData?.name ? profileData.name.charAt(0) : 'R'}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{profileData?.name}</h3>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 mt-1">
                      VERIFIED RESIDENT
                    </span>
                  </div>
                </div>

                {/* Profile Information List */}
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="text-slate-400 uppercase font-bold text-[10px] block mb-1">
                      Assigned Residential Unit
                    </label>
                    <p className="font-semibold text-slate-800 text-sm">
                      {profileData?.houses?.[0]
                        ? `Block ${profileData.houses[0].block} - Flat ${profileData.houses[0].houseNumber} (${profileData.houses[0].type.replace('_', ' ')})`
                        : 'No flat assigned'}
                    </p>
                  </div>

                  <div>
                    <label className="text-slate-400 uppercase font-bold text-[10px] block mb-1">
                      Registered Mobile Number
                    </label>
                    <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{profileData?.phone}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 uppercase font-bold text-[10px] block mb-1">
                      Email Address
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="yourname@example.com"
                        className="h-10 px-3 rounded-xl border border-slate-300 text-xs flex-1 focus:outline-none focus:border-blue-600 font-medium"
                      />
                      <button
                        onClick={() => updateProfileMutation.mutate(emailInput)}
                        disabled={updateProfileMutation.isPending}
                        className="h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {emailSavedSuccess && (
                      <p className="text-[11px] text-emerald-600 mt-1">✓ Email updated successfully</p>
                    )}
                  </div>
                </div>

                {/* Sign Out Button (44px+ height) */}
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => logoutMutation.mutate()}
                    className="w-full h-12 rounded-xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 flex items-center justify-center space-x-2 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log Out from Device</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================
          REFUND REQUEST MODAL
      ======================================================================== */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Request Deposit Refund</h3>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Qualifying Payment
                </label>
                <select
                  value={refundPaymentId}
                  onChange={(e) => setRefundPaymentId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-blue-600"
                >
                  <option value="">-- Choose verified payment --</option>
                  {refundsData?.eligiblePayments?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {formatPaiseToINR(BigInt(p.amountPaise))} - {p.method} (
                      {new Date(p.createdAt).toLocaleDateString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Refund Amount (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  step="100"
                  value={refundAmountRupees}
                  onChange={(e) => setRefundAmountRupees(e.target.value)}
                  placeholder="e.g. 40000"
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Claim</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:border-blue-600 mb-2"
                >
                  <option value="Moving out / Lease ended">Moving out / Lease ended</option>
                  <option value="Excess payment adjustment">Excess payment adjustment</option>
                  <option value="Deposit waiver by committee">Deposit waiver by committee</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {refundError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-start space-x-2 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{refundError}</span>
                </div>
              )}

              <button
                onClick={() => {
                  const num = parseFloat(refundAmountRupees);
                  if (isNaN(num) || num <= 0) {
                    setRefundError('Please enter a valid refund amount.');
                    return;
                  }
                  if (!refundPaymentId) {
                    setRefundError('Please select a payment transaction.');
                    return;
                  }
                  refundMutation.mutate({
                    paymentId: refundPaymentId,
                    amount: Math.round(num * 100),
                    reason: refundReason,
                  });
                }}
                disabled={refundMutation.isPending}
                className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {refundMutation.isPending ? 'Submitting Claim...' : 'Submit Refund Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MOBILE BOTTOM NAVIGATION (Fixed, 5 Tabs, ≥ 44px tap targets)
      ======================================================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center justify-around px-2 z-30 shadow-lg">
        <button
          onClick={() => setActiveTab('DASHBOARD')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-colors ${
            activeTab === 'DASHBOARD' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('PAY_NOW');
            setPayScreenState('FORM');
          }}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-colors ${
            activeTab === 'PAY_NOW' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-[10px]">Pay</span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-colors ${
            activeTab === 'HISTORY' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Receipt className="h-5 w-5" />
          <span className="text-[10px]">History</span>
        </button>

        <button
          onClick={() => setActiveTab('REFUNDS')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-colors ${
            activeTab === 'REFUNDS' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <RotateCcw className="h-5 w-5" />
          <span className="text-[10px]">Refunds</span>
        </button>

        <button
          onClick={() => setActiveTab('PROFILE')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-colors ${
            activeTab === 'PROFILE' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <UserIcon className="h-5 w-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </nav>
    </div>
  );
}
