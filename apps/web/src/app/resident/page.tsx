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
  AlertCircle,
  RotateCw,
  X,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { formatPaiseToINR } from '@colony/shared/edge';

interface DepositData {
  id: string;
  title: string;
  amountDue: string;
  amountPaid: string;
  status: string;
  dueDate: string;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    createdAt: string;
    receiptNumber?: string;
    pdfUrl?: string;
  }>;
}

export default function ResidentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [depositData, setDepositData] = useState<DepositData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'HOME' | 'PAYMENTS' | 'PROFILE'>('HOME');

  // Checkout modal states
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [customAmountRupees, setCustomAmountRupees] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    receiptNumber?: string;
  } | null>(null);

  const fetchProfileAndDeposit = async () => {
    try {
      const [userRes, depositRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/deposits/my-deposit'),
      ]);

      if (!userRes.ok) {
        router.push('/login');
        return;
      }

      const userData = await userRes.json();
      setUser(userData.user);

      if (depositRes.ok) {
        const depData = await depositRes.json();
        setDepositData(depData.deposit);
      }
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndDeposit();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // Monetary calculations
  const duePaise = depositData ? BigInt(depositData.amountDue) : 0n;
  const paidPaise = depositData ? BigInt(depositData.amountPaid) : 0n;
  const remainingPaise = duePaise > paidPaise ? duePaise - paidPaise : 0n;

  // Razorpay Checkout flow
  const handleInitiatePayment = async () => {
    if (!depositData) return;

    setPaymentError(null);
    setIsProcessingPayment(true);
    setPendingConfirmation(false);

    try {
      let requestedPaise: number | undefined;
      if (paymentType === 'PARTIAL') {
        const parsed = parseFloat(customAmountRupees);
        if (isNaN(parsed) || parsed < 1000) {
          setPaymentError('Minimum partial installment is ₹1,000.');
          setIsProcessingPayment(false);
          return;
        }
        requestedPaise = Math.round(parsed * 100);
        if (BigInt(requestedPaise) > remainingPaise) {
          setPaymentError(
            `Amount cannot exceed remaining balance of ${formatPaiseToINR(remainingPaise)}.`,
          );
          setIsProcessingPayment(false);
          return;
        }
      }

      const idempotencyKey = `idemp_ui_${depositData.id}_${Date.now()}`;

      // 1. Create order on server (validates amounts strictly in paise)
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositId: depositData.id,
          requestedAmountPaise: requestedPaise,
          idempotencyKey,
        }),
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        setPaymentError(orderData.error || orderData.message || 'Failed to initialize payment.');
        setIsProcessingPayment(false);
        return;
      }

      // Check if running in mock/dev mode
      const isMock = orderData.orderId.startsWith('order_mock_');

      if (isMock) {
        // Dev Simulation of Checkout
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
              setPaymentSuccessData(verifyData);
              await fetchProfileAndDeposit();
            } else {
              setPendingConfirmation(true);
            }
          } catch {
            setPendingConfirmation(true);
          } finally {
            setIsProcessingPayment(false);
          }
        }, 1200);
        return;
      }

      // Live Razorpay Checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency || 'INR',
        name: 'ColonyDeposit',
        description: `Security Deposit Payment - Unit ${user?.houses?.[0]?.block || ''}-${user?.houses?.[0]?.houseNumber || ''}`,
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
              setPaymentSuccessData(verifyData);
              await fetchProfileAndDeposit();
            } else {
              // Delayed UPI confirmation state
              setPendingConfirmation(true);
            }
          } catch {
            setPendingConfirmation(true);
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
          name: user?.name,
          contact: user?.phone,
        },
        theme: {
          color: '#2563eb',
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        setPaymentError(resp.error.description || 'Payment was declined by your bank/UPI app.');
        setIsProcessingPayment(false);
      });
      rzp.open();
    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed to initiate.');
      setIsProcessingPayment(false);
    }
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
        {/* Welcome & Deposit Due Card */}
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
            <div className="bg-white/10 backdrop-blur-sm px-5 py-4 rounded-xl border border-white/20 self-start sm:self-auto min-w-[200px]">
              <div className="text-[10px] text-blue-200 uppercase font-semibold">
                Remaining Deposit Balance
              </div>
              <div className="text-2xl font-bold mt-0.5">{formatPaiseToINR(remainingPaise)}</div>
              <div className="flex items-center space-x-1 text-[11px] mt-1">
                {remainingPaise === 0n ? (
                  <span className="text-emerald-300 flex items-center space-x-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Fully Settled</span>
                  </span>
                ) : (
                  <span className="text-amber-200 flex items-center space-x-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Due: {depositData ? new Date(depositData.dueDate).toLocaleDateString('en-IN') : ''}</span>
                  </span>
                )}
              </div>
              {remainingPaise > 0n && (
                <button
                  onClick={() => {
                    setIsPaymentModalOpen(true);
                    setPaymentSuccessData(null);
                    setPendingConfirmation(false);
                    setPaymentError(null);
                  }}
                  className="mt-3 w-full py-2 px-3 rounded-lg bg-white text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors shadow-sm flex items-center justify-center space-x-1.5"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Pay with UPI / Cards</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Grid */}
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
                Payment Slips
              </h3>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {depositData?.payments?.length || 0} Transactions
              </p>
              <p className="text-xs text-slate-500 mt-1">Instant Digital Receipts</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-start space-x-4">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Razorpay Engine
              </h3>
              <p className="text-base font-bold text-slate-900 mt-0.5">Live Gateway Active</p>
              <p className="text-xs text-slate-500 mt-1">UPI, Cards, NetBanking, QR</p>
            </div>
          </div>
        </div>

        {/* Transaction History & Receipts Table */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Payment History &amp; Receipts</h3>
            <span className="text-xs text-slate-500">Live transaction records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Official Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {depositData?.payments && depositData.payments.length > 0 ? (
                  depositData.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5">
                        {new Date(p.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-3.5 font-medium">{p.method}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-900">
                        {formatPaiseToINR(BigInt(p.amount))}
                      </td>
                      <td className="px-6 py-3.5">
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
                      </td>
                      <td className="px-6 py-3.5">
                        {p.receiptNumber ? (
                          <a
                            href={p.pdfUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            <span>{p.receiptNumber}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-slate-400">
                      No payments recorded yet. Click &apos;Pay with UPI&apos; to settle your dues.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Razorpay Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Pay Security Deposit</h3>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Success state */}
            {paymentSuccessData ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">Payment Successful!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Your security deposit obligation has been updated.
                </p>
                {paymentSuccessData.receiptNumber && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 inline-block text-xs font-mono font-bold text-blue-700">
                    Receipt: {paymentSuccessData.receiptNumber}
                  </div>
                )}
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="mt-6 w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            ) : pendingConfirmation ? (
              /* Delayed UPI Confirmation State */
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
                  <Clock className="h-8 w-8" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Payment Awaiting Confirmation</h4>
                <p className="text-xs text-slate-600 mt-2 px-4">
                  Your UPI app/bank has initiated the transaction. We will confirm shortly as soon as the
                  gateway reports capture. Your balance will be credited automatically.
                </p>
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 text-white font-semibold text-xs"
                >
                  I Understand
                </button>
              </div>
            ) : (
              /* Form State */
              <div className="py-4 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] uppercase font-bold text-slate-500">
                    Total Due Balance
                  </span>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">
                    {formatPaiseToINR(remainingPaise)}
                  </p>
                </div>

                {/* Option: Full or Partial */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Payment Amount Option
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentType('FULL')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                        paymentType === 'FULL'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Pay Full Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('PARTIAL')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                        paymentType === 'PARTIAL'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Custom Partial
                    </button>
                  </div>
                </div>

                {/* Custom Amount input */}
                {paymentType === 'PARTIAL' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Custom Amount (₹) - Min ₹1,000
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-500">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1000"
                        step="100"
                        value={customAmountRupees}
                        onChange={(e) => setCustomAmountRupees(e.target.value)}
                        placeholder="10000"
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600 font-bold"
                      />
                    </div>
                  </div>
                )}

                {/* Error */}
                {paymentError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-start space-x-2 border border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{paymentError}</span>
                  </div>
                )}

                {/* Action Button */}
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={handleInitiatePayment}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isProcessingPayment ? (
                    <>
                      <RotateCw className="h-4 w-4 animate-spin" />
                      <span>Connecting to Razorpay...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        Proceed to Pay{' '}
                        {paymentType === 'FULL'
                          ? formatPaiseToINR(remainingPaise)
                          : customAmountRupees
                            ? `₹${parseFloat(customAmountRupees).toLocaleString('en-IN')}`
                            : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Navigation */}
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
          onClick={() => {
            setActiveTab('PAYMENTS');
            if (remainingPaise > 0n) {
              setIsPaymentModalOpen(true);
            }
          }}
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
