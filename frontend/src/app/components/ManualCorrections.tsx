import { AlertTriangle, Check, X, RefreshCw, Plus } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getCorrections,
  approveCorrection,
  rejectCorrection,
  submitCorrection,
  getWorkers,
  getSettings,
  type Correction,
  type Worker,
} from '../../api/client';
import { useAuth } from '../hooks/useAuth';
import { PageShell, ErrorState, EmptyState } from './layout/PageShell';
import { FormField, FormInput, FormSelect, FormTextarea, Modal } from './ui/FormField';
import { PrintButton } from './ui/PrintButton';

const EVENT_TYPES = [
  { value: 'checked-in', label: 'Check In' },
  { value: 'checked-out', label: 'Check Out' },
  { value: 'tea-break', label: 'Tea Break' },
  { value: 'lunch-break', label: 'Lunch Break' },
];

export function ManualCorrections() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(true);

  // New Correction Modal state (BUG-04)
  const [showModal, setShowModal] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [formData, setFormData] = useState({
    employeeCode: '',
    eventType: 'checked-in',
    originalTime: '',
    correctedTime: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const { user, isAdmin } = useAuth();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [data, settings] = await Promise.all([
        getCorrections(),
        getSettings().catch(() => null),
      ]);
      setCorrections(data);
      setError(null);
      const supervisorMayApprove = settings?.perm_supervisor_correction_approve !== 'false';
      setCanApprove(isAdmin || supervisorMayApprove);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load corrections');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // BUG-E: Cache workers after first load, only re-fetch if list is empty
  const handleOpenModal = async () => {
    if (workers.length === 0) {
      try {
        const data = await getWorkers();
        setWorkers(data.filter((w: any) => w.isActive !== false));
      } catch {
        toast.error('Failed to load worker list');
        return;
      }
    }
    setFormData({ employeeCode: '', eventType: 'checked-in', originalTime: '', correctedTime: '', reason: '' });
    setShowModal(true);
  };

  const handleSubmitCorrection = async () => {
    if (!formData.employeeCode || !formData.correctedTime || !formData.reason.trim()) {
      toast.error('Please fill in Worker, Corrected Time, and Reason');
      return;
    }
    setSubmitting(true);
    try {
      await submitCorrection({
        employeeCode: formData.employeeCode,
        requestedBy: user?.name || 'Supervisor',
        reason: formData.reason,
        eventType: formData.eventType,
        originalTime: formData.originalTime || undefined,
        correctedTime: formData.correctedTime,
      });
      toast.success('Correction request submitted');
      setShowModal(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit correction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id + '-approve');
    try {
      const updated = await approveCorrection(id, user?.name || 'Supervisor');
      setCorrections(prev => prev.map(c => c.id === id ? updated : c));
      toast.success('Correction approved — attendance record updated');
    } catch (err: any) {
      toast.error('Failed to approve: ' + (err.message ?? 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id + '-reject');
    try {
      const updated = await rejectCorrection(id, user?.name || 'Supervisor');
      setCorrections(prev => prev.map(c => c.id === id ? updated : c));
      toast.success('Correction rejected');
    } catch (err: any) {
      toast.error('Failed to reject: ' + (err.message ?? 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  // BUG-02 fix: show real date for records older than 24h (not always "Yesterday")
  const formatTimestamp = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (error) {
    return <ErrorState title="Failed to load corrections" message={error} onRetry={fetchData} />;
  }

  const pendingCount = corrections.filter(c => c.status === 'pending').length;

  return (
    <PageShell
      title="Manual Corrections"
      description="Submit and approve attendance record corrections."
      printTitle="FAMS — Manual Corrections"
      actions={
        <>
          <button type="button" onClick={handleOpenModal} data-tour="btn-new-correction" className="fams-btn fams-btn-primary">
            <Plus className="w-4 h-4" /> New correction
          </button>
          <PrintButton />
          <button type="button" onClick={fetchData} disabled={loading} className="fams-btn fams-btn-outline">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </>
      }
    >

        {pendingCount > 0 && (
          <div data-tour="alert-pending" className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Approval Required</p>
              <p className="text-sm text-amber-700 mt-1">
                {pendingCount} correction{pendingCount !== 1 ? 's' : ''} pending approval. All manual changes create an audit trail.
              </p>
            </div>
          </div>
        )}

        {loading && corrections.length === 0 ? (
          <div className="text-center py-12 text-[var(--gray-500)]">Loading corrections...</div>
        ) : corrections.length === 0 ? (
          <EmptyState
            title="No corrections found"
            description="Submit a correction when a worker missed a scan or the system recorded the wrong time."
            action={{ label: 'New correction', onClick: handleOpenModal }}
          />
        ) : (
          <div id="corrections-queue" className="space-y-4">
            {corrections.map((correction, index) => (
              <div key={correction.id} data-tour="correction-card" className="fams-card overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-[var(--gray-900)]">{correction.worker.name}</h3>
                        <span className="text-sm text-[var(--gray-500)]">({correction.worker.employeeCode})</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          correction.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : correction.status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {correction.status.charAt(0).toUpperCase() + correction.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--gray-600)]">
                        Requested by {correction.requestedBy} • {formatTimestamp(correction.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                    <div>
                      <p className="text-xs text-[var(--gray-500)] uppercase mb-1">Correction Type</p>
                      <p className="text-sm font-black text-blue-600 uppercase">
                        {correction.eventType?.replace(/-/g, ' ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--gray-500)] uppercase mb-1">Original Time</p>
                      <p className="text-sm font-mono text-red-600 line-through">{formatDateTime(correction.originalTime)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--gray-500)] uppercase mb-1">Corrected Time</p>
                      <p className="text-sm font-mono text-green-600 font-semibold">{formatDateTime(correction.correctedTime)}</p>
                    </div>
                  </div>

                  <div className="bg-[var(--gray-50)] rounded-lg p-4 mb-4">
                    <p className="text-xs text-[var(--gray-500)] uppercase mb-2">Reason</p>
                    <p className="text-sm text-[var(--gray-900)]">{correction.reason}</p>
                  </div>

                  {correction.status === 'pending' && (
                    <div id={index === 0 ? "corrections-actions" : undefined} className="flex gap-3">
                      {canApprove ? (
                        <>
                          <button
                            onClick={() => handleApprove(correction.id)}
                            disabled={actionLoading === correction.id + '-approve'}
                            data-tour="btn-approve"
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-bold"
                          >
                            <Check className="w-4 h-4" />
                            {actionLoading === correction.id + '-approve' ? 'Approving...' : 'Approve & Apply'}
                          </button>
                          <button
                            onClick={() => handleReject(correction.id)}
                            disabled={actionLoading === correction.id + '-reject'}
                            data-tour="btn-reject"
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-bold"
                          >
                            <X className="w-4 h-4" />
                            {actionLoading === correction.id + '-reject' ? 'Rejecting...' : 'Reject'}
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 p-3 bg-gray-50 border border-gray-100 rounded-lg text-center text-sm text-gray-500 font-medium italic">
                          You do not have permission to approve manual corrections. Contact an administrator.
                        </div>
                      )}
                    </div>
                  )}

                  {correction.status === 'approved' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <Check className="w-5 h-5" />
                      <p className="text-sm font-medium">Correction approved — attendance record updated</p>
                    </div>
                  )}

                  {correction.status === 'rejected' && (
                    <div className="flex items-center gap-2 text-red-600">
                      <X className="w-5 h-5" />
                      <p className="text-sm font-medium">Correction rejected</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {showModal && (
        <Modal
          title="New correction"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowModal(false)} className="fams-btn fams-btn-outline">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitCorrection}
                disabled={submitting}
                className="fams-btn fams-btn-primary"
              >
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </>
          }
        >
          <FormField label="Worker" required>
            <FormSelect
              value={formData.employeeCode}
              onChange={e => setFormData(f => ({ ...f, employeeCode: e.target.value }))}
            >
              <option value="">Select worker</option>
              {workers.map(w => (
                <option key={w.employeeCode} value={w.employeeCode}>{w.name} ({w.employeeCode})</option>
              ))}
            </FormSelect>
          </FormField>

          <FormField label="Event type" required>
            <FormSelect
              value={formData.eventType}
              onChange={e => setFormData(f => ({ ...f, eventType: e.target.value }))}
            >
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </FormSelect>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Original time">
              <FormInput
                type="datetime-local"
                value={formData.originalTime}
                onChange={e => setFormData(f => ({ ...f, originalTime: e.target.value }))}
              />
            </FormField>
            <FormField label="Corrected time" required>
              <FormInput
                type="datetime-local"
                value={formData.correctedTime}
                onChange={e => setFormData(f => ({ ...f, correctedTime: e.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Reason" required hint="Explain why this correction is needed for the audit trail.">
            <FormTextarea
              value={formData.reason}
              onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="e.g. Worker forgot to scan at shift start"
            />
          </FormField>
        </Modal>
      )}
    </PageShell>
  );
}
