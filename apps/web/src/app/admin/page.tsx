'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Home,
  CreditCard,
  Users,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  UserCheck,
  Search,
  Filter,
  Download,
  PlusCircle,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  LogOut,
  RotateCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  X,
  Lock,
  Bell,
  Send,
  Radio,
  Layers,
  RefreshCcw,
  Scale,
  ArrowDownLeft,
  Check,
  AlertOctagon,
} from 'lucide-react';
const CollectionChart = dynamic(() => import('@/components/admin/CollectionChart'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center text-xs text-slate-400">
      Loading chart analytics...
    </div>
  ),
});
import { formatPaiseToINR } from '@colony/shared/edge';

type AdminTab =
  | 'DASHBOARD'
  | 'PAYMENTS'
  | 'RESIDENTS'
  | 'RECORD_OFFLINE'
  | 'SETTINGS'
  | 'AUDIT_LOGS'
  | 'REMINDERS_QUEUES'
  | 'REFUNDS_RECONCILIATION'
  | 'ADMINS';

export default function AdminPortalPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');

  // Payments table state
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [paymentsStatus, setPaymentsStatus] = useState('');
  const [paymentsBlock, setPaymentsBlock] = useState('');
  const [paymentsMethod, setPaymentsMethod] = useState('');

  // Resident management state
  const [residentsSearch, setResidentsSearch] = useState('');
  const [residentsBlock, setResidentsBlock] = useState('');
  const [isAddResidentOpen, setIsAddResidentOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // Add resident form fields
  const [newResName, setNewResName] = useState('');
  const [newResPhone, setNewResPhone] = useState('');
  const [newResEmail, setNewResEmail] = useState('');
  const [newResBlock, setNewResBlock] = useState('A');
  const [newResHouseNum, setNewResHouseNum] = useState('');
  const [newResHouseType, setNewResHouseType] = useState('FLAT_2BHK');
  const [newResDepositRupees, setNewResDepositRupees] = useState('40000');
  const [addResidentError, setAddResidentError] = useState<string | null>(null);

  // Bulk import state
  const [csvContent, setCsvContent] = useState('');
  const [bulkImportReport, setBulkImportReport] = useState<any>(null);
  const [bulkImportLoading, setBulkImportLoading] = useState(false);

  // Record Offline Payment state
  const [offlineDepositId, setOfflineDepositId] = useState('');
  const [offlineResidentId, setOfflineResidentId] = useState('');
  const [offlineAmountRupees, setOfflineAmountRupees] = useState('');
  const [offlineMethod, setOfflineMethod] = useState('CASH');
  const [offlineNotes, setOfflineNotes] = useState('');
  const [offlineSuccess, setOfflineSuccess] = useState<any>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);

  // Audit logs state
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<any>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // Admin management state
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('ADMIN');
  const [adminMgmtError, setAdminMgmtError] = useState<string | null>(null);

  // Reminders & BullMQ Queue state
  const [bulkBlock, setBulkBlock] = useState('ALL');
  const [bulkStatus, setBulkStatus] = useState('ALL');
  const [bulkChannel, setBulkChannel] = useState('ALL');
  const [bulkBatchSize, setBulkBatchSize] = useState(10);
  const [bulkDelaySeconds, setBulkDelaySeconds] = useState(3);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);

  // Refunds & Reconciliation state
  const [refundSubTab, setRefundSubTab] = useState<'REFUND_QUEUE' | 'RECONCILIATION'>('REFUND_QUEUE');
  const [refundStatusFilter, setRefundStatusFilter] = useState('');
  const [reconciliationFilter, setReconciliationFilter] = useState('ALL');
  const [reviewModalRefund, setReviewModalRefund] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewReason, setReviewReason] = useState('');
  const [customRefundRupees, setCustomRefundRupees] = useState('');
  const [reconciliationFeedback, setReconciliationFeedback] = useState<string | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Real-Time Server-Sent Events (SSE) for Admin Dashboard
  React.useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events?channel=admin');

      es.addEventListener('connected', () => {
        setIsLiveConnected(true);
      });

      es.addEventListener('PAYMENT_RECEIVED', () => {
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['admin-payments-list'] });
      });

      es.addEventListener('REFUND_REQUESTED', () => {
        queryClient.invalidateQueries({ queryKey: ['admin-refunds-list'] });
      });

      es.onerror = () => {
        setIsLiveConnected(false);
      };
    } catch {
      // EventSource unsupported in current environment
    }

    return () => {
      es?.close();
    };
  }, [queryClient]);

  // ============================================================================
  // Fetch Current Admin Context
  // ============================================================================
  const { data: meData, isLoading: isMeLoading } = useQuery({
    queryKey: ['admin-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      if (data.user?.role !== 'ADMIN' && data.user?.role !== 'SUPER_ADMIN') {
        router.push('/resident');
        throw new Error('Forbidden');
      }
      return data.user;
    },
  });

  const isSuperAdmin = meData?.role === 'SUPER_ADMIN';

  // ============================================================================
  // Fetch Dashboard Stats & Charts
  // ============================================================================
  const { data: dashData, isLoading: isDashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) throw new Error('Failed to load admin dashboard');
      return res.json();
    },
    enabled: activeTab === 'DASHBOARD',
  });

  // ============================================================================
  // Fetch Payments Table (Server-side paginated & filtered)
  // ============================================================================
  const { data: paymentsData, isLoading: isPaymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: [
      'admin-payments-table',
      paymentsPage,
      paymentsSearch,
      paymentsStatus,
      paymentsBlock,
      paymentsMethod,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: paymentsPage.toString(),
        limit: '10',
        search: paymentsSearch,
        status: paymentsStatus,
        block: paymentsBlock,
        method: paymentsMethod,
      });
      const res = await fetch(`/api/admin/payments?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payments');
      return res.json();
    },
    enabled: activeTab === 'PAYMENTS',
  });

  // ============================================================================
  // Fetch Residents Directory
  // ============================================================================
  const { data: residentsData, isLoading: isResidentsLoading, refetch: refetchResidents } = useQuery({
    queryKey: ['admin-residents-directory', residentsSearch, residentsBlock],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: residentsSearch,
        block: residentsBlock,
      });
      const res = await fetch(`/api/admin/residents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch residents');
      return res.json();
    },
    enabled: activeTab === 'RESIDENTS' || activeTab === 'RECORD_OFFLINE',
  });

  // ============================================================================
  // Fetch Settings
  // ============================================================================
  const { data: settingsData, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['admin-settings-data'],
    queryFn: async () => {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettingsForm(data.setting);
      return data.setting;
    },
    enabled: activeTab === 'SETTINGS',
  });

  // ============================================================================
  // Fetch Audit Logs
  // ============================================================================
  const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ['admin-audit-logs', auditPage, auditAction],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: auditPage.toString(),
        limit: '15',
        action: auditAction,
      });
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
    enabled: activeTab === 'AUDIT_LOGS',
  });

  // ============================================================================
  // Fetch Administrators (Super Admin Only)
  // ============================================================================
  const { data: adminsData, isLoading: isAdminsLoading, refetch: refetchAdmins } = useQuery({
    queryKey: ['admin-administrators-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/administrators');
      if (!res.ok) throw new Error('Failed to fetch administrators');
      return res.json();
    },
    enabled: activeTab === 'ADMINS' && isSuperAdmin,
  });

  // ============================================================================
  // Fetch Failed DLQ Jobs
  // ============================================================================
  const { data: failedJobsData, isLoading: isFailedJobsLoading, refetch: refetchFailedJobs } = useQuery({
    queryKey: ['admin-failed-jobs-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/failed-jobs');
      if (!res.ok) throw new Error('Failed to fetch failed jobs');
      return res.json();
    },
    enabled: activeTab === 'REMINDERS_QUEUES',
  });

  // ============================================================================
  // Fetch Refunds List
  // ============================================================================
  const { data: refundsData, isLoading: isRefundsLoading, refetch: refetchRefunds } = useQuery({
    queryKey: ['admin-refunds-list', refundStatusFilter],
    queryFn: async () => {
      const url = refundStatusFilter
        ? `/api/admin/refunds?status=${refundStatusFilter}`
        : '/api/admin/refunds';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch refunds');
      return res.json();
    },
    enabled: activeTab === 'REFUNDS_RECONCILIATION',
  });

  // ============================================================================
  // Fetch Reconciliation Report
  // ============================================================================
  const { data: reconciliationData, isLoading: isReconciliationLoading, refetch: refetchReconciliation } = useQuery({
    queryKey: ['admin-reconciliation-report'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reconciliation');
      if (!res.ok) throw new Error('Failed to fetch reconciliation report');
      return res.json();
    },
    enabled: activeTab === 'REFUNDS_RECONCILIATION',
  });

  // ============================================================================
  // Review Refund Mutation
  // ============================================================================
  const reviewRefundMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await fetch(`/api/admin/refunds/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      return data;
    },
    onSuccess: (data) => {
      setReviewModalRefund(null);
      setReviewReason('');
      setCustomRefundRupees('');
      refetchRefunds();
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      alert(data.message || 'Refund review completed successfully');
    },
    onError: (err: any) => {
      alert(`Refund review error: ${err.message}`);
    },
  });

  // ============================================================================
  // One-click Re-sync Mutation
  // ============================================================================
  const resyncPaymentMutation = useMutation({
    mutationFn: async (gatewayPaymentId: string) => {
      const res = await fetch('/api/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayPaymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Re-sync failed');
      return data;
    },
    onSuccess: (data) => {
      setReconciliationFeedback(data.message);
      refetchReconciliation();
      queryClient.invalidateQueries({ queryKey: ['admin-payments-list'] });
      setTimeout(() => setReconciliationFeedback(null), 8000);
    },
    onError: (err: any) => {
      alert(`Re-sync failed: ${err.message}`);
    },
  });

  // ============================================================================
  // Mutations
  // ============================================================================
  const bulkRemindersMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch reminders');
      return data;
    },
    onSuccess: (data) => {
      setReminderFeedback(data.message);
      queryClient.invalidateQueries({ queryKey: ['admin-failed-jobs-list'] });
      setTimeout(() => setReminderFeedback(null), 8000);
    },
    onError: (err: any) => {
      alert(`Error dispatching reminders: ${err.message}`);
    },
  });

  const retryFailedJobMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch('/api/admin/failed-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retry job');
      return data;
    },
    onSuccess: () => {
      refetchFailedJobs();
      alert('Job retried and re-queued successfully!');
    },
    onError: (err: any) => {
      alert(`Retry failed: ${err.message}`);
    },
  });

  const singleReminderMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/admin/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reminder');
      return data;
    },
    onSuccess: (data) => {
      alert(data.message || 'Reminder sent successfully');
    },
    onError: (err: any) => {
      alert(`Error: ${err.message}`);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
    },
    onSuccess: () => {
      router.push('/login');
    },
  });

  const addResidentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add resident');
      return data;
    },
    onSuccess: () => {
      setIsAddResidentOpen(false);
      setNewResName('');
      setNewResPhone('');
      setNewResEmail('');
      setNewResHouseNum('');
      setAddResidentError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-residents-directory'] });
    },
    onError: (err: Error) => {
      setAddResidentError(err.message);
    },
  });

  const recordOfflineMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/payments/record-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record offline payment');
      return data;
    },
    onSuccess: (data) => {
      setOfflineSuccess(data);
      setOfflineAmountRupees('');
      setOfflineNotes('');
      setOfflineError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments-table'] });
      queryClient.invalidateQueries({ queryKey: ['admin-residents-directory'] });
    },
    onError: (err: Error) => {
      setOfflineError(err.message);
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      return data;
    },
    onSuccess: () => {
      setSettingsSavedMessage(true);
      setTimeout(() => setSettingsSavedMessage(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['admin-settings-data'] });
    },
  });

  const addAdminMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/admin/administrators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create admin');
      return data;
    },
    onSuccess: () => {
      setNewAdminName('');
      setNewAdminPhone('');
      setAdminMgmtError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-administrators-list'] });
    },
    onError: (err: Error) => {
      setAdminMgmtError(err.message);
    },
  });

  // Handle CSV Bulk Import Submission
  const handleBulkImportSubmit = async () => {
    if (!csvContent.trim()) return;
    setBulkImportLoading(true);
    setBulkImportReport(null);

    try {
      const lines = csvContent.trim().split('\n');
      const rows = [];
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        if (parts.length >= 5) {
          rows.push({
            name: parts[0],
            phone: parts[1],
            email: parts[2] || undefined,
            block: parts[3],
            houseNumber: parts[4],
            houseType: parts[5] || 'FLAT_2BHK',
            depositRupees: parts[6] ? parseFloat(parts[6]) : 40000,
          });
        }
      }

      const res = await fetch('/api/admin/residents/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });

      const report = await res.json();
      setBulkImportReport(report);
      if (report.importedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['admin-residents-directory'] });
      }
    } catch (err: any) {
      setBulkImportReport({ error: err.message });
    } finally {
      setBulkImportLoading(false);
    }
  };

  if (isMeLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row pb-20 md:pb-0">
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
            <p className="text-[10px] text-slate-400">Admin Control Console</p>
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
            onClick={() => setActiveTab('PAYMENTS')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'PAYMENTS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>Payments Table</span>
          </button>

          <button
            onClick={() => setActiveTab('RECORD_OFFLINE')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'RECORD_OFFLINE'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <DollarSign className="h-4 w-4" />
            <span>Record Cash / Cheque</span>
          </button>

          <button
            onClick={() => setActiveTab('RESIDENTS')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'RESIDENTS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Residents &amp; Houses</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT_LOGS')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'AUDIT_LOGS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Audit Trail</span>
          </button>

          <button
            onClick={() => setActiveTab('REMINDERS_QUEUES')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'REMINDERS_QUEUES'
                ? 'bg-amber-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Bell className="h-4 w-4" />
            <span>Reminders &amp; Workers</span>
          </button>

          <button
            onClick={() => setActiveTab('REFUNDS_RECONCILIATION')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'REFUNDS_RECONCILIATION'
                ? 'bg-rose-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>Refunds &amp; Reconciliation</span>
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'SETTINGS'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Colony Rules</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('ADMINS')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'ADMINS'
                  ? 'bg-purple-600 text-white'
                  : 'text-purple-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Admin Management</span>
            </button>
          )}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-slate-800">
          <div className="mb-3">
            <p className="text-xs font-bold text-white truncate">{meData?.name}</p>
            <span
              className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                isSuperAdmin
                  ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                  : 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
              }`}
            >
              {meData?.role}
            </span>
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
          MAIN VIEWPORT
      ======================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="bg-white border-b border-slate-200 h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <div className="md:hidden h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Admin Console</h2>
              <p className="text-[10px] text-slate-500">Greenwood Palms RWA Committee</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{meData?.role}</span>
            </span>

            <button
              onClick={() => logoutMutation.mutate()}
              className="md:hidden text-xs text-red-600 font-semibold p-2"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Tab Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* ====================================================================
              1. TAB: DASHBOARD
          ==================================================================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Header Title */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Financial Overview</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time deposit collection metrics and daily trends
                  </p>
                </div>
                <button
                  onClick={() => refetchDash()}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  title="Refresh"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              {/* 4 Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Collected
                  </span>
                  <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                    {dashData?.summary
                      ? formatPaiseToINR(BigInt(dashData.summary.totalCollectedPaise))
                      : '₹0'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {dashData?.summary?.totalPaymentsCount || 0} Successful Transactions
                  </p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Pending Balance
                  </span>
                  <p className="text-2xl font-extrabold text-amber-600 mt-1">
                    {dashData?.summary
                      ? formatPaiseToINR(BigInt(dashData.summary.totalPendingPaise))
                      : '₹0'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Unpaid across households</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Paid vs Unpaid Units
                  </span>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1">
                    <span className="text-emerald-600">
                      {dashData?.summary?.householdCounts?.paid || 0}
                    </span>{' '}
                    /{' '}
                    <span className="text-slate-400">
                      {dashData?.summary?.householdCounts?.total || 50}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {dashData?.summary?.householdCounts?.overdue || 0} Overdue Units
                  </p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Quick Action
                  </span>
                  <button
                    onClick={() => setActiveTab('RECORD_OFFLINE')}
                    className="mt-2 w-full h-10 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Record Cash / Cheque</span>
                  </button>
                </div>
              </div>

              {/* Recharts Daily Collection Timeline Chart */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-slate-900">Collections Timeline (Last 14 Days)</h4>
                  <p className="text-xs text-slate-500">Daily collections in Indian Rupees (₹)</p>
                </div>
                <CollectionChart data={dashData?.chartData} />
              </div>

              {/* Recent Verified Payments Table */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Recent Completed Collections</h4>
                  <button
                    onClick={() => setActiveTab('PAYMENTS')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    View All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">Flat / Unit</th>
                        <th className="px-6 py-3">Resident</th>
                        <th className="px-6 py-3">Amount</th>
                        <th className="px-6 py-3">Method</th>
                        <th className="px-6 py-3">Receipt No</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {dashData?.recentPayments?.map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-6 py-3.5 font-bold text-slate-900">{p.houseLabel}</td>
                          <td className="px-6 py-3.5">{p.residentName}</td>
                          <td className="px-6 py-3.5 font-extrabold text-emerald-600">
                            {formatPaiseToINR(BigInt(p.amountPaise))}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {p.method} {p.isOffline ? '(Offline)' : ''}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-blue-600 font-mono font-bold">
                            {p.receiptNumber ? (
                              <a
                                href={`/api/resident/receipts/${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline flex items-center space-x-1"
                              >
                                <span>{p.receiptNumber}</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              2. TAB: PAYMENTS TABLE (Server-side paginated & filtered)
          ==================================================================== */}
          {activeTab === 'PAYMENTS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Collections Ledger</h3>
                  <p className="text-xs text-slate-500">Filtered server-side pagination with CSV export</p>
                </div>
                <a
                  href={`/api/admin/payments?export=csv&search=${encodeURIComponent(paymentsSearch)}&status=${paymentsStatus}&block=${paymentsBlock}&method=${paymentsMethod}`}
                  download
                  className="h-10 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 flex items-center space-x-2 shadow-sm self-start sm:self-auto"
                >
                  <Download className="h-4 w-4" />
                  <span>Export to Excel / CSV</span>
                </a>
              </div>

              {/* Filter Controls Bar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search name, phone, flat, receipt..."
                    value={paymentsSearch}
                    onChange={(e) => {
                      setPaymentsSearch(e.target.value);
                      setPaymentsPage(1);
                    }}
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600"
                  />
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>

                <select
                  value={paymentsStatus}
                  onChange={(e) => {
                    setPaymentsStatus(e.target.value);
                    setPaymentsPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600"
                >
                  <option value="">All Statuses</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="CREATED">CREATED / PENDING</option>
                  <option value="FAILED">FAILED</option>
                  <option value="REFUNDED">REFUNDED</option>
                  <option value="PARTIALLY_REFUNDED">PARTIALLY REFUNDED</option>
                </select>

                <select
                  value={paymentsBlock}
                  onChange={(e) => {
                    setPaymentsBlock(e.target.value);
                    setPaymentsPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600"
                >
                  <option value="">All Blocks</option>
                  <option value="A">Block A</option>
                  <option value="B">Block B</option>
                  <option value="C">Block C</option>
                  <option value="D">Block D</option>
                </select>

                <select
                  value={paymentsMethod}
                  onChange={(e) => {
                    setPaymentsMethod(e.target.value);
                    setPaymentsPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600"
                >
                  <option value="">All Methods</option>
                  <option value="UPI">UPI</option>
                  <option value="NET_BANKING">Net Banking</option>
                  <option value="DEBIT_CARD">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="CASH">CASH (Offline)</option>
                  <option value="CHEQUE">CHEQUE (Offline)</option>
                </select>
              </div>

              {/* Data Table */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">Receipt / Ref</th>
                        <th className="px-6 py-3">Flat</th>
                        <th className="px-6 py-3">Resident</th>
                        <th className="px-6 py-3">Amount</th>
                        <th className="px-6 py-3">Method</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {isPaymentsLoading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                            Loading payments...
                          </td>
                        </tr>
                      ) : paymentsData?.payments?.length > 0 ? (
                        paymentsData.payments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-6 py-3.5 font-mono font-bold text-blue-600">
                              {p.receipt?.receiptNumber ? (
                                <a
                                  href={`/api/resident/receipts/${p.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline flex items-center space-x-1"
                                >
                                  <span>{p.receipt.receiptNumber}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-slate-400">{p.id.slice(-8)}</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 font-bold text-slate-900">
                              Block {p.house.block}-{p.house.houseNumber}
                            </td>
                            <td className="px-6 py-3.5">
                              <div>{p.resident.name}</div>
                              <div className="text-[11px] text-slate-400">{p.resident.phone}</div>
                            </td>
                            <td className="px-6 py-3.5 font-extrabold text-slate-900">
                              {formatPaiseToINR(BigInt(p.amountPaise))}
                            </td>
                            <td className="px-6 py-3.5 font-medium">
                              {p.method} {p.isOffline && <span className="text-amber-600 font-bold">(Cash)</span>}
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
                            <td className="px-6 py-3.5 text-slate-500">
                              {new Date(p.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                            No payment transactions matched your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {paymentsData?.pagination && (
                  <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      Page {paymentsData.pagination.page} of {paymentsData.pagination.totalPages || 1} ({paymentsData.pagination.total} total)
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                        disabled={paymentsPage <= 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          setPaymentsPage((p) =>
                            p < paymentsData.pagination.totalPages ? p + 1 : p,
                          )
                        }
                        disabled={paymentsPage >= paymentsData.pagination.totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ====================================================================
              3. TAB: RECORD OFFLINE PAYMENT (Cash / Cheque)
          ==================================================================== */}
          {activeTab === 'RECORD_OFFLINE' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Record Offline Payment</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Accept cash or physical cheques at the society office counter with automatic receipt generation
                </p>
              </div>

              {/* Success Result Banner */}
              {offlineSuccess && (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start space-x-3 text-xs text-emerald-900">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-emerald-900">Offline Payment Recorded!</h4>
                    <p className="mt-0.5 text-emerald-700">
                      Receipt <span className="font-mono font-bold">{offlineSuccess.receiptNumber}</span> was automatically generated.
                    </p>
                    <div className="mt-3 flex space-x-3">
                      <a
                        href={`/api/resident/receipts/${offlineSuccess.receiptNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 px-3 rounded-lg bg-emerald-700 text-white font-bold flex items-center space-x-1"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Print Receipt Slip</span>
                      </a>
                      <button
                        onClick={() => setOfflineSuccess(null)}
                        className="text-emerald-700 font-bold hover:underline"
                      >
                        Record Another
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-5">
                {/* Select Resident / House */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Select Resident &amp; Unit
                  </label>
                  <select
                    value={offlineDepositId}
                    onChange={(e) => {
                      const depId = e.target.value;
                      setOfflineDepositId(depId);
                      const res = residentsData?.residents?.find(
                        (r: any) => r.deposit?.id === depId,
                      );
                      if (res) {
                        setOfflineResidentId(res.id);
                        if (res.deposit) {
                          setOfflineAmountRupees(
                            (Number(res.deposit.remainingPaise) / 100).toString(),
                          );
                        }
                      }
                    }}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:border-blue-600 bg-white"
                  >
                    <option value="">-- Choose Resident Unit --</option>
                    {residentsData?.residents?.map((r: any) => (
                      <option key={r.id} value={r.deposit?.id || ''}>
                        Flat {r.house?.block}-{r.house?.houseNumber} — {r.name} (Due: {r.deposit ? formatPaiseToINR(BigInt(r.deposit.remainingPaise)) : 'No Due'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount in Rupees */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Payment Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-sm font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={offlineAmountRupees}
                      onChange={(e) => setOfflineAmountRupees(e.target.value)}
                      placeholder="e.g. 40000"
                      className="w-full h-11 pl-8 pr-4 rounded-xl border border-slate-300 text-base font-bold focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Method */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Method</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CASH', 'CHEQUE', 'BANK_TRANSFER'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setOfflineMethod(m)}
                        className={`h-11 rounded-xl text-xs font-bold border transition-all ${
                          offlineMethod === m
                            ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-600/20'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cheque / Bank Ref Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Reason &amp; Counter Verification Notes
                  </label>
                  <textarea
                    rows={3}
                    value={offlineNotes}
                    onChange={(e) => setOfflineNotes(e.target.value)}
                    placeholder="e.g. Received cash at society desk from resident. Cheque No. 40291 HDFC Bank."
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-600"
                  ></textarea>
                </div>

                {/* Error */}
                {offlineError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-start space-x-2 border border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{offlineError}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="button"
                  disabled={recordOfflineMutation.isPending || !offlineDepositId}
                  onClick={() => {
                    const parsed = parseFloat(offlineAmountRupees);
                    if (isNaN(parsed) || parsed <= 0) {
                      setOfflineError('Please enter a valid amount.');
                      return;
                    }
                    if (!offlineNotes.trim()) {
                      setOfflineError('Verification notes or cheque number is required for audit logs.');
                      return;
                    }
                    recordOfflineMutation.mutate({
                      depositId: offlineDepositId,
                      userId: offlineResidentId,
                      amount: Math.round(parsed * 100),
                      method: offlineMethod,
                      offlineNotes,
                      idempotencyKey: `idemp_offline_${offlineDepositId}_${Date.now()}`,
                    });
                  }}
                  className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {recordOfflineMutation.isPending ? (
                    <>
                      <RotateCw className="h-4 w-4 animate-spin" />
                      <span>Recording Payment &amp; Generating Receipt...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Confirm &amp; Issue Official Receipt</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ====================================================================
              4. TAB: RESIDENTS & HOUSES (Add & Bulk Import)
          ==================================================================== */}
          {activeTab === 'RESIDENTS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Residents Directory</h3>
                  <p className="text-xs text-slate-500">Manage colony households, assign units and deposit rules</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsBulkImportOpen(true)}
                    className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center space-x-1.5 shadow-sm"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Bulk CSV Import</span>
                  </button>
                  <button
                    onClick={() => setIsAddResidentOpen(true)}
                    className="h-10 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 flex items-center space-x-1.5 shadow-sm"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Add Household</span>
                  </button>
                </div>
              </div>

              {/* Residents Table */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">Flat / Unit</th>
                        <th className="px-6 py-3">Resident</th>
                        <th className="px-6 py-3">Phone</th>
                        <th className="px-6 py-3">Deposit Due</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {isResidentsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            Loading directory...
                          </td>
                        </tr>
                      ) : residentsData?.residents?.length > 0 ? (
                        residentsData.residents.map((r: any) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-6 py-3.5 font-bold text-slate-900">
                              {r.house ? `Block ${r.house.block}-${r.house.houseNumber}` : 'Unassigned'}
                            </td>
                            <td className="px-6 py-3.5 font-semibold">{r.name}</td>
                            <td className="px-6 py-3.5">{r.phone}</td>
                            <td className="px-6 py-3.5 font-bold text-slate-900">
                              {r.deposit ? formatPaiseToINR(BigInt(r.deposit.remainingPaise)) : '₹0'}
                            </td>
                            <td className="px-6 py-3.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.deposit?.status === 'PAID'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.deposit?.status === 'OVERDUE'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {r.deposit?.status || 'NO DUE'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            No resident households found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              5. TAB: AUDIT LOGS VIEWER
          ==================================================================== */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Immutable Audit Trail</h3>
                  <p className="text-xs text-slate-500">Every financial and security action is recorded</p>
                </div>
                <button
                  onClick={() => refetchAudit()}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              {/* Logs Table */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">Timestamp</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Entity</th>
                        <th className="px-6 py-3">Actor</th>
                        <th className="px-6 py-3">IP Address</th>
                        <th className="px-6 py-3">Diff / Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {isAuditLoading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            Loading audit trail...
                          </td>
                        </tr>
                      ) : auditData?.logs?.length > 0 ? (
                        auditData.logs.map((l: any) => (
                          <tr key={l.id} className="hover:bg-slate-50">
                            <td className="px-6 py-3 text-slate-500 font-mono text-[11px]">
                              {new Date(l.createdAt).toLocaleString('en-IN')}
                            </td>
                            <td className="px-6 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                                {l.action}
                              </span>
                            </td>
                            <td className="px-6 py-3 font-semibold text-slate-900">{l.entity}</td>
                            <td className="px-6 py-3">{l.actor.phone || l.actor.name}</td>
                            <td className="px-6 py-3 text-slate-400 font-mono text-[11px]">{l.ipAddress || '-'}</td>
                            <td className="px-6 py-3">
                              <button
                                onClick={() => setSelectedAuditLog(l)}
                                className="text-blue-600 hover:underline font-semibold"
                              >
                                View JSON
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            No audit logs recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              6. TAB: SETTINGS & COLONY RULES
          ==================================================================== */}
          {activeTab === 'SETTINGS' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Colony Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Deposit rules, payment methods &amp; late fee policies</p>
              </div>

              {settingsSavedMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                  ✓ Settings saved and audit log updated successfully.
                </div>
              )}

              {settingsForm && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Colony / RWA Name</label>
                    <input
                      type="text"
                      value={settingsForm.colonyName || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, colonyName: e.target.value })}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Society Address</label>
                    <input
                      type="text"
                      value={settingsForm.address || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  {/* Standard Deposit Rules per Flat Type */}
                  <div className="pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                      Standard Security Deposit by Unit Type (₹)
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {['FLAT_1BHK', 'FLAT_2BHK', 'FLAT_3BHK', 'FLAT_4BHK', 'VILLA'].map((type) => {
                        const amountPaise =
                          settingsForm.depositRules?.standardDepositPaise?.[type] || 4000000;
                        return (
                          <div key={type}>
                            <label className="block text-[11px] text-slate-500 font-medium mb-1">
                              {type.replace('_', ' ')}
                            </label>
                            <input
                              type="number"
                              value={amountPaise / 100}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const updated = {
                                  ...settingsForm.depositRules,
                                  standardDepositPaise: {
                                    ...settingsForm.depositRules?.standardDepositPaise,
                                    [type]: val * 100,
                                  },
                                };
                                setSettingsForm({ ...settingsForm, depositRules: updated });
                              }}
                              className="w-full h-10 px-3 rounded-lg border border-slate-300 font-bold text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Partial Payment Toggle */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Allow Partial Installments</h4>
                      <p className="text-[11px] text-slate-500">Allow residents to pay in 2 installments</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(settingsForm.depositRules?.maxInstallmentsAllowed || 1) > 1}
                      onChange={(e) => {
                        const updated = {
                          ...settingsForm.depositRules,
                          maxInstallmentsAllowed: e.target.checked ? 2 : 1,
                        };
                        setSettingsForm({ ...settingsForm, depositRules: updated });
                      }}
                      className="h-5 w-5 text-blue-600 rounded"
                    />
                  </div>

                  <button
                    onClick={() => saveSettingsMutation.mutate(settingsForm)}
                    disabled={saveSettingsMutation.isPending}
                    className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-md flex items-center justify-center space-x-1.5"
                  >
                    <span>Save Colony Configuration</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ====================================================================
              7. TAB: ADMIN MANAGEMENT (Super Admin Only)
          ==================================================================== */}
          {activeTab === 'ADMINS' && isSuperAdmin && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Administrator Management</h3>
                <p className="text-xs text-slate-500 mt-0.5">Super Admin privileges: promote committee admins</p>
              </div>

              {/* Add Admin Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Add or Promote Committee Admin</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Chandra"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Mobile (+91)</label>
                    <input
                      type="tel"
                      placeholder="+91 9800000004"
                      value={newAdminPhone}
                      onChange={(e) => setNewAdminPhone(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                </div>

                {adminMgmtError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs">{adminMgmtError}</div>
                )}

                <button
                  onClick={() => {
                    if (!newAdminName || !newAdminPhone) {
                      setAdminMgmtError('Name and phone are required.');
                      return;
                    }
                    addAdminMutation.mutate({
                      name: newAdminName,
                      phone: newAdminPhone,
                      role: newAdminRole,
                    });
                  }}
                  disabled={addAdminMutation.isPending}
                  className="w-full h-11 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700"
                >
                  {addAdminMutation.isPending ? 'Granting...' : 'Grant Admin Role'}
                </button>
              </div>

              {/* Current Admins List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
                {adminsData?.admins?.map((adm: any) => (
                  <div key={adm.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{adm.name}</p>
                      <p className="text-[11px] text-slate-500">{adm.phone}</p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                        adm.role === 'SUPER_ADMIN'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {adm.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ====================================================================
              8. TAB: REMINDERS & BULLMQ QUEUES (DLQ)
          ==================================================================== */}
          {activeTab === 'REMINDERS_QUEUES' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Reminders &amp; Background Workers</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  BullMQ distributed workers for PDF receipts, multi-channel reminders, and Dead-Letter Queue (DLQ)
                </p>
              </div>

              {/* Status Alert / Feedback */}
              {reminderFeedback && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <span>{reminderFeedback}</span>
                </div>
              )}

              {/* Architecture & Worker Health Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Receipts Queue</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">Branded PDF Engine</div>
                  <p className="text-[11px] text-slate-500">
                    Generates official PDF receipts and stores to Cloudflare R2 / S3 automatically upon payment.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Notifications Queue</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">Multi-Channel Router</div>
                  <p className="text-[11px] text-slate-500">
                    Dispatches OTP, payment confirmations, and reminders via SMS, Resend/SendGrid, &amp; WhatsApp.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reminders Queue</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">Batching &amp; Anti-Spike</div>
                  <p className="text-[11px] text-slate-500">
                    Staggers bulk messages with progressive batch delays to protect carrier rate limits.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dead-Letter Queue</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      (failedJobsData?.count || 0) > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {failedJobsData?.count || 0} Failed
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">Exponential Retries</div>
                  <p className="text-[11px] text-slate-500">
                    5 automatic retry attempts with backoff before entering DLQ. Payment settlement is always preserved.
                  </p>
                </div>
              </div>

              {/* Bulk Reminders Staggered Dispatcher */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Send Staggered Bulk Deposit Reminders</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sends reminders in sequential batches with configurable delay to prevent notification provider spikes
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-amber-50 text-amber-800 rounded-lg text-xs font-bold border border-amber-200">
                    Batch Delay Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Target Block</label>
                    <select
                      value={bulkBlock}
                      onChange={(e) => setBulkBlock(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:border-blue-600 bg-white"
                    >
                      <option value="ALL">All Blocks (A, B, C, D)</option>
                      <option value="A">Block A Only</option>
                      <option value="B">Block B Only</option>
                      <option value="C">Block C Only</option>
                      <option value="D">Block D Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Deposit Status</label>
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:border-blue-600 bg-white"
                    >
                      <option value="ALL">All Unpaid (Pending + Overdue)</option>
                      <option value="OVERDUE">Overdue Only (Urgent Warning)</option>
                      <option value="PENDING">Pending Only (Standard Reminder)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Notification Channels</label>
                    <select
                      value={bulkChannel}
                      onChange={(e) => setBulkChannel(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:border-blue-600 bg-white"
                    >
                      <option value="ALL">All Channels (SMS + Email + WhatsApp)</option>
                      <option value="SMS">SMS Only</option>
                      <option value="EMAIL">Email Only</option>
                      <option value="WHATSAPP">WhatsApp Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Batch Chunk Size</label>
                    <select
                      value={bulkBatchSize}
                      onChange={(e) => setBulkBatchSize(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:border-blue-600 bg-white"
                    >
                      <option value={5}>5 households / batch</option>
                      <option value={10}>10 households / batch</option>
                      <option value={20}>20 households / batch</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Delay Between Batches</label>
                    <select
                      value={bulkDelaySeconds}
                      onChange={(e) => setBulkDelaySeconds(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:border-blue-600 bg-white"
                    >
                      <option value={2}>2 seconds</option>
                      <option value={3}>3 seconds (Standard)</option>
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    💡 Reminders contain direct mobile payment links and computed deposit balances.
                  </div>
                  <button
                    onClick={() =>
                      bulkRemindersMutation.mutate({
                        block: bulkBlock,
                        depositStatus: bulkStatus,
                        channel: bulkChannel,
                        batchSize: bulkBatchSize,
                        delayBetweenBatchesSeconds: bulkDelaySeconds,
                      })
                    }
                    disabled={bulkRemindersMutation.isPending}
                    className="w-full sm:w-auto h-11 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span>{bulkRemindersMutation.isPending ? 'Scheduling Batches...' : 'Dispatch Staggered Reminders'}</span>
                  </button>
                </div>
              </div>

              {/* Dead-Letter Queue (DLQ) & Failed Jobs Inspector */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Dead-Letter Queue (DLQ) &amp; Failed Jobs</h4>
                      <p className="text-[11px] text-slate-500">
                        Notification delivery failures that exceeded 5 retry attempts. Payments remain settled.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => refetchFailedJobs()}
                    className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center space-x-1"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                {isFailedJobsLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Inspecting Dead-Letter Queue...</div>
                ) : !failedJobsData?.data || failedJobsData.data.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                    <div className="text-sm font-bold text-slate-900">All Worker Queues Running Healthy</div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      There are currently 0 failed jobs in the Dead-Letter Queue. All receipts and notification dispatches have processed cleanly.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Recipient</th>
                          <th className="py-3 px-4">Channel</th>
                          <th className="py-3 px-4">Notification Type</th>
                          <th className="py-3 px-4">Failure Reason / Trace</th>
                          <th className="py-3 px-4">Failed At</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {failedJobsData.data.map((job: any) => (
                          <tr key={job.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{job.recipient}</div>
                              <div className="text-[10px] text-slate-500">{job.phone}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {job.channel}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                {job.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate text-[11px] text-rose-600 font-mono">
                              {job.metadata?.error || job.message || 'Carrier delivery timeout'}
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-[11px]">
                              {new Date(job.failedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: '2-digit',
                                month: 'short',
                              })}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => retryFailedJobMutation.mutate(job.id)}
                                disabled={retryFailedJobMutation.isPending}
                                className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition-colors"
                              >
                                Retry Job
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ====================================================================
              9. TAB: REFUNDS & RECONCILIATION
          ==================================================================== */}
          {activeTab === 'REFUNDS_RECONCILIATION' && (
            <div className="space-y-6">
              {/* Header with Sub-tabs and Export Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Refunds &amp; Gateway Reconciliation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review resident refund claims, trigger gateway refunds, and reconcile Razorpay settlements
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <a
                    href="/api/admin/reconciliation/export"
                    download
                    className="h-9 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-colors flex items-center space-x-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Recon CSV</span>
                  </a>
                </div>
              </div>

              {/* Sub-navigation pills */}
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
                <button
                  onClick={() => setRefundSubTab('REFUND_QUEUE')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 ${
                    refundSubTab === 'REFUND_QUEUE'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4" />
                  <span>Refund Requests</span>
                  {refundsData?.data && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-700 text-white font-extrabold">
                      {refundsData.data.filter((r: any) => r.status === 'PENDING').length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setRefundSubTab('RECONCILIATION')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 ${
                    refundSubTab === 'RECONCILIATION'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span>Gateway Reconciliation</span>
                  {reconciliationData?.report?.metrics?.discrepancyCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-extrabold animate-pulse">
                      {reconciliationData.report.metrics.discrepancyCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Status Alert / Feedback */}
              {reconciliationFeedback && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <span>{reconciliationFeedback}</span>
                </div>
              )}

              {/* ================================================================
                  SUB-VIEW 1: REFUND REQUESTS QUEUE
              ================================================================ */}
              {refundSubTab === 'REFUND_QUEUE' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-700">Filter Status:</span>
                      <select
                        value={refundStatusFilter}
                        onChange={(e) => setRefundStatusFilter(e.target.value)}
                        className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold focus:outline-none focus:border-rose-600 bg-white"
                      >
                        <option value="">All Requests</option>
                        <option value="PENDING">Pending Review</option>
                        <option value="PROCESSED">Approved &amp; Refunded</option>
                        <option value="FAILED">Rejected</option>
                      </select>
                    </div>

                    <button
                      onClick={() => refetchRefunds()}
                      className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center space-x-1"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Refresh Queue</span>
                    </button>
                  </div>

                  {/* Refunds Ledger Table */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    {isRefundsLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading refund claims...</div>
                    ) : !refundsData?.data || refundsData.data.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                        <div className="text-sm font-bold text-slate-900">No Refund Requests Pending</div>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          There are currently no active deposit refund requests requiring committee review.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-4">Resident &amp; Property</th>
                              <th className="py-3 px-4">Paid Total</th>
                              <th className="py-3 px-4">Claimed Refund</th>
                              <th className="py-3 px-4">Resident Reason</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                            {refundsData.data.map((r: any) => (
                              <tr key={r.id} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4">
                                  <div className="font-bold text-slate-900">{r.resident.name}</div>
                                  <div className="text-[11px] text-slate-500">{r.unit} • {r.resident.phone}</div>
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  {formatPaiseToINR(r.payment.amountPaise)}
                                </td>
                                <td className="py-3 px-4 font-extrabold text-rose-600">
                                  {formatPaiseToINR(r.amountPaise)}
                                </td>
                                <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-600" title={r.reason}>
                                  {r.reason}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      r.status === 'PROCESSED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : r.status === 'PENDING'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-slate-500 text-[11px]">
                                  {new Date(r.createdAt).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {r.status === 'PENDING' ? (
                                    <div className="flex items-center justify-end space-x-1.5">
                                      <button
                                        onClick={() => {
                                          setReviewModalRefund(r);
                                          setReviewAction('APPROVE');
                                          setCustomRefundRupees((Number(r.amountPaise) / 100).toString());
                                        }}
                                        className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition-colors"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => {
                                          setReviewModalRefund(r);
                                          setReviewAction('REJECT');
                                          setReviewReason('');
                                        }}
                                        className="h-8 px-2.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-[11px] transition-colors"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {r.gatewayRefundId || 'Settled'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================================================================
                  SUB-VIEW 2: GATEWAY RECONCILIATION
              ================================================================ */}
              {refundSubTab === 'RECONCILIATION' && (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Evaluated</span>
                      <div className="text-2xl font-black text-slate-900">
                        {reconciliationData?.report?.metrics?.totalTransactions || 0}
                      </div>
                      <p className="text-[11px] text-slate-500">Cross-verified against Razorpay API</p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Matched &amp; Balanced</span>
                      <div className="text-2xl font-black text-emerald-600">
                        {reconciliationData?.report?.metrics?.matchedCount || 0}
                      </div>
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        {(
                          ((reconciliationData?.report?.metrics?.matchedCount || 0) /
                            Math.max(1, reconciliationData?.report?.metrics?.totalTransactions || 1)) *
                          100
                        ).toFixed(1)}
                        % 1:1 ledger parity
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flagged Discrepancies</span>
                      <div className={`text-2xl font-black ${
                        (reconciliationData?.report?.metrics?.discrepancyCount || 0) > 0 ? 'text-amber-600' : 'text-slate-900'
                      }`}>
                        {reconciliationData?.report?.metrics?.discrepancyCount || 0}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {reconciliationData?.report?.metrics?.missingInDbCount || 0} missing • {reconciliationData?.report?.metrics?.statusMismatchCount || 0} status drift
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Automated Daily Poller</span>
                      <div className="text-sm font-bold text-slate-900 mt-1">Midnight Cron Job</div>
                      <p className="text-[11px] text-slate-500">
                        Nightly reconciliation sweeps detect and flag stranded payments automatically.
                      </p>
                    </div>
                  </div>

                  {/* Filter and Actions Bar */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-700">Display:</span>
                      <div className="flex items-center space-x-1">
                        {['ALL', 'DISCREPANCIES', 'MATCHED'].map((filter) => (
                          <button
                            key={filter}
                            onClick={() => setReconciliationFilter(filter)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              reconciliationFilter === filter
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => refetchReconciliation()}
                      className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center space-x-1"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Re-Run Comparison</span>
                    </button>
                  </div>

                  {/* Reconciliation Table */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Gateway Reference</th>
                            <th className="py-3 px-4">Resident &amp; Unit</th>
                            <th className="py-3 px-4">Gateway Amount</th>
                            <th className="py-3 px-4">DB Amount</th>
                            <th className="py-3 px-4">Status (GW / DB)</th>
                            <th className="py-3 px-4">Discrepancy Flag</th>
                            <th className="py-3 px-4 text-right">One-Click Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {reconciliationData?.report?.items
                            ?.filter((item: any) => {
                              if (reconciliationFilter === 'DISCREPANCIES') return item.discrepancyType !== 'MATCHED';
                              if (reconciliationFilter === 'MATCHED') return item.discrepancyType === 'MATCHED';
                              return true;
                            })
                            .map((item: any) => (
                              <tr key={item.gatewayPaymentId} className="hover:bg-slate-50/50">
                                <td className="py-3 px-4">
                                  <div className="font-mono font-bold text-slate-900">{item.gatewayPaymentId}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{item.gatewayOrderId || 'N/A'}</div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-slate-900">{item.residentName || 'Unassigned'}</div>
                                  <div className="text-[11px] text-slate-500">{item.unit || 'Colony Unit'}</div>
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  {formatPaiseToINR(item.gatewayAmountPaise)}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-700">
                                  {item.dbAmountPaise ? formatPaiseToINR(item.dbAmountPaise) : '₹0'}
                                </td>
                                <td className="py-3 px-4 text-[11px]">
                                  <span className="font-semibold text-emerald-700">{item.gatewayStatus}</span>
                                  <span className="text-slate-400"> / </span>
                                  <span className="font-semibold text-slate-700">{item.dbStatus || 'MISSING'}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      item.discrepancyType === 'MATCHED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : item.discrepancyType === 'STATUS_MISMATCH'
                                        ? 'bg-amber-100 text-amber-800'
                                        : item.discrepancyType === 'MISSING_IN_DB'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-purple-100 text-purple-800'
                                    }`}
                                  >
                                    {item.discrepancyType}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {item.discrepancyType !== 'MATCHED' ? (
                                    <button
                                      onClick={() => resyncPaymentMutation.mutate(item.gatewayPaymentId)}
                                      disabled={resyncPaymentMutation.isPending}
                                      className="h-8 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs shadow-sm transition-colors flex items-center space-x-1 ml-auto disabled:opacity-50"
                                    >
                                      <RotateCw className="h-3 w-3" />
                                      <span>Re-Sync</span>
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center text-emerald-600 font-bold text-[11px] space-x-1">
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Balanced</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================
          ADD RESIDENT MODAL
      ======================================================================== */}
      {isAddResidentOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Add Colony Household</h3>
              <button onClick={() => setIsAddResidentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Resident Full Name</label>
                <input
                  type="text"
                  value={newResName}
                  onChange={(e) => setNewResName(e.target.value)}
                  placeholder="e.g. Sumanth Hegde"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
                <input
                  type="tel"
                  value={newResPhone}
                  onChange={(e) => setNewResPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Block</label>
                  <select
                    value={newResBlock}
                    onChange={(e) => setNewResBlock(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="A">Block A</option>
                    <option value="B">Block B</option>
                    <option value="C">Block C</option>
                    <option value="D">Block D</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">House / Flat No</label>
                  <input
                    type="text"
                    value={newResHouseNum}
                    onChange={(e) => setNewResHouseNum(e.target.value)}
                    placeholder="e.g. 204"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Initial Deposit Due (₹)</label>
                <input
                  type="number"
                  value={newResDepositRupees}
                  onChange={(e) => setNewResDepositRupees(e.target.value)}
                  placeholder="40000"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-bold"
                />
              </div>

              {addResidentError && (
                <div className="p-2.5 bg-red-50 text-red-700 rounded-lg text-xs">{addResidentError}</div>
              )}

              <button
                onClick={() => {
                  const num = parseFloat(newResDepositRupees);
                  addResidentMutation.mutate({
                    name: newResName,
                    phone: newResPhone,
                    email: newResEmail,
                    block: newResBlock,
                    houseNumber: newResHouseNum,
                    houseType: newResHouseType,
                    customDepositPaise: isNaN(num) ? undefined : Math.round(num * 100),
                  });
                }}
                disabled={addResidentMutation.isPending}
                className="w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {addResidentMutation.isPending ? 'Creating Household...' : 'Confirm & Create Household'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          BULK IMPORT CSV MODAL
      ======================================================================== */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Bulk CSV Import Households</h3>
              <button onClick={() => setIsBulkImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-slate-600">
                Format: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">name, phone, email, block, houseNumber, houseType, depositRupees</code>
              </p>

              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={`Aarav Sharma, +919811200001, aarav@example.com, A, 101, FLAT_2BHK, 40000\nVihaan Patel, +919811200002, vihaan@example.com, A, 102, FLAT_3BHK, 60000`}
                className="w-full p-3 font-mono text-[11px] rounded-xl border border-slate-300 focus:outline-none focus:border-blue-600"
              ></textarea>

              {bulkImportReport && (
                <div
                  className={`p-3 rounded-xl text-xs ${
                    bulkImportReport.failedCount > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <p className="font-bold">
                    Import Result: {bulkImportReport.importedCount} Imported, {bulkImportReport.failedCount} Failed
                  </p>
                  {bulkImportReport.errors?.map((err: any, i: number) => (
                    <p key={i} className="text-[11px] text-red-700 mt-1">
                      Row {err.row}: {err.identifier} - {err.reason}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={handleBulkImportSubmit}
                disabled={bulkImportLoading || !csvContent.trim()}
                className="w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkImportLoading ? 'Validating & Importing...' : 'Validate & Import Households'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          AUDIT LOG JSON VIEWER MODAL
      ======================================================================== */}
      {selectedAuditLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                Audit Snapshot: {selectedAuditLog.action} ({selectedAuditLog.entity})
              </h3>
              <button onClick={() => setSelectedAuditLog(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-1">State After:</span>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(selectedAuditLog.after, null, 2)}
                </pre>
              </div>
              {selectedAuditLog.before && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">State Before:</span>
                  <pre className="p-3 bg-slate-900 text-amber-400 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedAuditLog.before, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          REVIEW REFUND MODAL
      ======================================================================== */}
      {reviewModalRefund && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {reviewAction === 'APPROVE' ? 'Approve Security Deposit Refund' : 'Reject Refund Request'}
              </h3>
              <button onClick={() => setReviewModalRefund(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Resident:</span>
                  <span className="font-bold text-slate-900">{reviewModalRefund.resident?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Unit:</span>
                  <span className="font-bold text-slate-900">{reviewModalRefund.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Original Payment:</span>
                  <span className="font-bold text-slate-900">{formatPaiseToINR(reviewModalRefund.payment?.amountPaise)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Claimed Reason:</span>
                  <span className="font-semibold text-slate-700 italic">{reviewModalRefund.reason}</span>
                </div>
              </div>

              {reviewAction === 'APPROVE' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Refund Amount to Disburse (₹)
                    </label>
                    <input
                      type="number"
                      value={customRefundRupees}
                      onChange={(e) => setCustomRefundRupees(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold text-sm text-slate-900 focus:outline-none focus:border-rose-600"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Full or partial refund amount. Cannot exceed original paid balance.
                    </p>
                  </div>

                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 space-y-1">
                    <p className="font-bold">⚠️ Real-Time Gateway Disbursal</p>
                    <p>
                      Approving this request will immediately invoke the Razorpay Refund API and return funds to the resident&apos;s source account.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rejection Reason (Sent to Resident)
                  </label>
                  <textarea
                    rows={3}
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    placeholder="e.g. Unsettled utility dues or damage deductions require resolution"
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-rose-600"
                  />
                </div>
              )}

              <button
                onClick={() => {
                  const numRupees = parseFloat(customRefundRupees);
                  reviewRefundMutation.mutate({
                    id: reviewModalRefund.id,
                    payload: {
                      action: reviewAction,
                      reason: reviewReason || undefined,
                      approvedAmountPaise:
                        reviewAction === 'APPROVE' && !isNaN(numRupees)
                          ? Math.round(numRupees * 100)
                          : undefined,
                    },
                  });
                }}
                disabled={reviewRefundMutation.isPending}
                className={`w-full h-11 rounded-xl text-white font-bold text-xs shadow-md transition-colors disabled:opacity-50 ${
                  reviewAction === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {reviewRefundMutation.isPending
                  ? 'Processing Transaction...'
                  : reviewAction === 'APPROVE'
                  ? 'Confirm Gateway Refund'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MOBILE BOTTOM NAVIGATION (Admin Controls)
      ======================================================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 h-16 flex items-center justify-around px-2 z-30 shadow-lg text-slate-400">
        <button
          onClick={() => setActiveTab('DASHBOARD')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'DASHBOARD' ? 'text-blue-400 font-bold' : ''
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'PAYMENTS' ? 'text-blue-400 font-bold' : ''
          }`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-[10px]">Payments</span>
        </button>

        <button
          onClick={() => setActiveTab('RECORD_OFFLINE')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'RECORD_OFFLINE' ? 'text-blue-400 font-bold' : ''
          }`}
        >
          <DollarSign className="h-5 w-5" />
          <span className="text-[10px]">Cash Entry</span>
        </button>

        <button
          onClick={() => setActiveTab('RESIDENTS')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'RESIDENTS' ? 'text-blue-400 font-bold' : ''
          }`}
        >
          <Users className="h-5 w-5" />
          <span className="text-[10px]">Units</span>
        </button>

        <button
          onClick={() => setActiveTab('REMINDERS_QUEUES')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'REMINDERS_QUEUES' ? 'text-amber-400 font-bold' : ''
          }`}
        >
          <Bell className="h-5 w-5" />
          <span className="text-[10px]">Reminders</span>
        </button>

        <button
          onClick={() => setActiveTab('REFUNDS_RECONCILIATION')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'REFUNDS_RECONCILIATION' ? 'text-rose-400 font-bold' : ''
          }`}
        >
          <Scale className="h-5 w-5" />
          <span className="text-[10px]">Recon</span>
        </button>

        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`flex-1 h-full flex flex-col items-center justify-center space-y-1 ${
            activeTab === 'SETTINGS' ? 'text-blue-400 font-bold' : ''
          }`}
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px]">Rules</span>
        </button>
      </nav>
    </div>
  );
}
