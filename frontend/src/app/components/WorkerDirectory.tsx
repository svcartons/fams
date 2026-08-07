import { Search, Grid, List, UserPlus, Edit2, Trash2, Mail, Phone, Clock, Camera, Key, ShieldCheck, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { StatusBadge } from './StatusBadge';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getWorkers, getLiveStatus, createWorker, updateWorker, deleteWorker, getShifts, getSettings, createUser, getWorkerSummary, type Worker, type LiveWorker, type Shift, type WorkerSummary } from '../../api/client';
import { FaceRegistrationModal } from './FaceRegistrationModal';
import { PageShell, DataPanel, ErrorState } from './layout/PageShell';
import { FormField, FormInput, FormSelect, Modal } from './ui/FormField';

type WorkerWithStatus = Worker & { status: LiveWorker['status'] };

export function WorkerDirectory() {
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [workers, setWorkers] = useState<WorkerWithStatus[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [canDelete, setCanDelete] = useState(true);
  const [canEnroll, setCanEnroll] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerWithStatus | null>(null);
  const [formData, setFormData] = useState<Partial<Worker>>({
    employeeCode: '', name: '', email: '', phone: '', department: '', role: '', dailyWage: 800, overtimeRate: 150, shiftId: ''
  });
  const [faceModalWorker, setFaceModalWorker] = useState<{ id: string; name: string } | null>(null);

  // Grant Access State
  const [grantAccessWorker, setGrantAccessWorker] = useState<WorkerWithStatus | null>(null);
  const [accessForm, setAccessForm] = useState({ username: '', password: '', role: 'supervisor' });
  const [showPassword, setShowPassword] = useState(false);

  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [workerSummaries, setWorkerSummaries] = useState<Record<string, WorkerSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState<string | null>(null);
  const summaryMonth = new Date().toISOString().slice(0, 7);

  const toggleExpand = async (employeeCode: string) => {
    if (expandedWorker === employeeCode) {
      setExpandedWorker(null);
      return;
    }
    setExpandedWorker(employeeCode);
    if (!workerSummaries[employeeCode]) {
      try {
        setSummaryLoading(employeeCode);
        const summary = await getWorkerSummary(employeeCode, summaryMonth);
        setWorkerSummaries(prev => ({ ...prev, [employeeCode]: summary }));
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to load worker summary');
      } finally {
        setSummaryLoading(null);
      }
    }
  };

  const renderExpandPanel = (employeeCode: string) => {
    const summary = workerSummaries[employeeCode];
    const loadingSummary = summaryLoading === employeeCode;

    return (
      <div className="p-4 bg-[var(--gray-50)] border-t border-[var(--border)]">
        {loadingSummary ? (
          <p className="text-sm text-[var(--muted)]">Loading monthly stats…</p>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[11px] text-[var(--muted)] uppercase">Working days</p>
              <p className="font-semibold fams-mono">{summary.daysPresent}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--muted)] uppercase">Monthly salary</p>
              <p className="font-semibold fams-mono">₹{summary.monthlySalary.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--muted)] uppercase">Incomplete days</p>
              <p className="font-semibold fams-mono">{summary.daysIncomplete}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--muted)] uppercase">Today status</p>
              <StatusBadge status={summary.liveStatus as LiveWorker['status']} size="sm" />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Link
                to={`/reports?tab=payroll`}
                className="text-[12px] text-[var(--accent)] hover:underline"
              >
                View in Reports → Salary
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No summary available.</p>
        )}
      </div>
    );
  };

  // BUG-18: wrap in useCallback to prevent stale closure issues
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const s = await getSettings();
      if (!isAdmin && s.perm_supervisor_worker_view === 'false') {
        setHasPermission(false);
        setLoading(false);
        return;
      }
      setHasPermission(true);

      const [workerList, liveList, shiftList] = await Promise.all([getWorkers(), getLiveStatus(), getShifts()]);
      const liveMap = new Map(liveList.map(w => [w.id, w.status]));
      const merged: WorkerWithStatus[] = workerList.map(w => ({
        ...w,
        status: liveMap.get(w.employeeCode) ?? 'absent',
      }));
      setWorkers(merged);
      setShifts(shiftList);
      
      if (!isAdmin && s.perm_supervisor_worker_delete === 'false') {
        setCanDelete(false);
      } else {
        setCanDelete(true);
      }

      if (!isAdmin && s.perm_supervisor_enroll_workers === 'false') {
        setCanEnroll(false);
      } else {
        setCanEnroll(true);
      }
      
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load workers');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setEditingWorker(null);
    setFormData({
      // BUG-04: use timestamp + random to avoid collisions
      employeeCode: `W-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90) + 10}`,
      name: '', email: '', phone: '', department: '', role: '', dailyWage: 800, overtimeRate: 150, shiftId: shifts[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (worker: WorkerWithStatus) => {
    setEditingWorker(worker);
    setFormData({
      employeeCode: worker.employeeCode,
      name: worker.name,
      email: worker.email ?? '',
      phone: worker.phone ?? '',
      department: worker.department,
      role: worker.role,
      dailyWage: worker.dailyWage ?? 800,
      overtimeRate: worker.overtimeRate ?? 150,
      shiftId: worker.shiftId ?? ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (employeeCode: string) => {
    if (!confirm('Are you sure you want to deactivate this worker? Their history will be preserved.')) return;
    try {
      await deleteWorker(employeeCode);
      setWorkers(prev => prev.filter(w => w.employeeCode !== employeeCode));
      toast.success('Worker deleted successfully');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete worker');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading(editingWorker ? 'Updating worker...' : 'Creating worker...');
    try {
      if (editingWorker) {
        await updateWorker(editingWorker.employeeCode, formData);
        toast.success('Worker updated successfully', { id: loadingToast });
      } else {
        await createWorker(formData);
        toast.success('Worker created successfully', { id: loadingToast });
      }
      setIsModalOpen(false);
      fetchData(); // Refresh list
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save worker', { id: loadingToast });
    }
  };

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantAccessWorker) return;
    const loadingToast = toast.loading('Granting access...');
    try {
      await createUser({
        username: accessForm.username,
        password: accessForm.password,
        name: grantAccessWorker.name,
        role: accessForm.role,
        email: grantAccessWorker.email || null,
        workerId: grantAccessWorker.id, // Link to the physical worker record
      });
      toast.success('Dashboard access granted successfully!', { id: loadingToast });
      setGrantAccessWorker(null);
      fetchData(); // Refresh list to get updated user relations
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to grant access. Username might be taken.', { id: loadingToast });
    }
  };

  const filteredWorkers = workers.filter(worker =>
    worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    worker.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    worker.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (worker.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
    (worker.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const departmentCounts = workers.reduce((acc, worker) => {
    acc[worker.department] = (acc[worker.department] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading && hasPermission === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <ErrorState
        title="Access restricted"
        message="You do not have permission to view the worker directory. Contact an administrator if you need access."
      />
    );
  }

  if (error) {
    return <ErrorState title="Failed to load workers" message={error} onRetry={fetchData} />;
  }

  return (
    <PageShell
      title="Worker Directory"
      description={loading ? 'Loading…' : `${workers.length} workers registered across all departments.`}
      actions={
        (isAdmin || canEnroll) ? (
          <button type="button" onClick={openAddModal} data-tour="btn-add-worker" className="fams-btn fams-btn-primary">
            <UserPlus className="w-4 h-4" /> Add worker
          </button>
        ) : undefined
      }
    >
        <DataPanel className="mb-6">
          <div className="p-4 md:p-5 flex flex-row overflow-x-auto no-scrollbar gap-3 md:flex-wrap">
            {Object.entries(departmentCounts).map(([dept, count]) => (
              <div key={dept} className="px-3 py-1.5 bg-[var(--accent-soft)] rounded-md border border-[var(--accent-muted)] shrink-0">
                <span className="text-xs font-semibold text-[var(--text-primary)]">{dept}: </span>
                <span className="text-xs text-[var(--text-secondary)]">{count}</span>
              </div>
            ))}
          </div>
        </DataPanel>

        <DataPanel>
          <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search workers…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-tour="input-worker-search"
                className="fams-input"
              />
            </div>
            <div data-tour="btn-view-toggle" className="flex gap-1">
              <button type="button" onClick={() => setViewMode('grid')} className={`fams-btn fams-btn-outline px-2 ${viewMode === 'grid' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}>
                <Grid className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setViewMode('table')} className={`fams-btn fams-btn-outline px-2 ${viewMode === 'table' ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading && workers.length === 0 ? (
            <div className="p-12 text-center text-[var(--gray-500)]">Loading workers...</div>
          ) : viewMode === 'grid' ? (
            <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredWorkers.map((worker) => (
                <div key={worker.employeeCode}>
                <div
                  className="border border-[var(--border)] rounded-xl p-4 hover:shadow-md transition-shadow relative group bg-white cursor-pointer"
                  onClick={() => toggleExpand(worker.employeeCode)}
                >
                  <div className="absolute top-3 left-3">
                    {expandedWorker === worker.employeeCode
                      ? <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
                      : <ChevronDown className="w-4 h-4 text-[var(--muted)]" />}
                  </div>
                  <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={e => e.stopPropagation()}>
                    {canEnroll && (
                      <button data-tour="btn-face-register" onClick={() => setFaceModalWorker({ id: worker.employeeCode, name: worker.name })} className="p-2 bg-white text-green-600 rounded-lg shadow-sm border border-[var(--border)]" title="Face Scan">
                        <Camera className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      worker.user ? (
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg shadow-sm border border-purple-200 cursor-default" title={`Has Dashboard Access (${worker.user.role})`}>
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                      ) : (
                        <button data-tour="btn-grant-access" onClick={() => { setGrantAccessWorker(worker); setAccessForm({ username: '', password: '', role: 'supervisor' }); }} className="p-2 bg-white text-purple-600 rounded-lg shadow-sm border border-[var(--border)] hover:bg-purple-50" title="Grant Dashboard Access">
                          <Key className="w-4 h-4" />
                        </button>
                      )
                    )}
                    {canEnroll && (
                      <button data-tour="btn-edit-worker" onClick={() => openEditModal(worker)} className="p-2 bg-white text-blue-600 rounded-lg shadow-sm border border-[var(--border)]" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(worker.employeeCode)} className="p-2 bg-white text-red-600 rounded-lg shadow-sm border border-[var(--border)]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] font-bold text-lg border border-[var(--border)] overflow-hidden">
                      {worker.avatarPhoto ? (
                        <img src={worker.avatarPhoto} alt={worker.name} className="w-full h-full object-cover" />
                      ) : (
                        worker.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-20 sm:pr-0">
                      <h3 className="font-bold text-[var(--gray-900)] truncate">{worker.name}</h3>
                      <p className="text-xs text-[var(--gray-500)] font-mono">{worker.employeeCode}</p>
                    </div>
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--gray-600)]">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{worker.email || 'No email'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--gray-600)]">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{worker.phone || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--gray-600)]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{worker.shift?.name || 'No shift'}</span>
                    </div>
                    <div className="pt-2 flex items-center justify-between">
                      <div className="px-2 py-1 bg-[var(--gray-100)] rounded text-[10px] font-bold uppercase text-[var(--gray-600)]">
                        {worker.department}
                      </div>
                      <StatusBadge status={worker.status} size="sm" />
                    </div>
                  </div>
                </div>
                {expandedWorker === worker.employeeCode && (
                  <div className="border border-t-0 border-[var(--border)] rounded-b-xl -mt-2 mb-2 bg-white">
                    {renderExpandPanel(worker.employeeCode)}
                  </div>
                )}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--gray-50)] border-b border-[var(--gray-200)]">
                  <tr>
                    <th className="w-10 px-4 py-4" />
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--gray-600)] uppercase">Worker</th>
                    <th className="hidden lg:table-cell px-6 py-4 text-left text-xs font-semibold text-[var(--gray-600)] uppercase">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--gray-600)] uppercase">Dept</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--gray-600)] uppercase">Status</th>
                    {isAdmin && <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--gray-600)] uppercase">Actions</th>}
                    {!isAdmin && (canEnroll || canDelete) && (
                      <th className="px-6 py-4 text-right text-xs font-semibold text-[var(--gray-600)] uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gray-100)]">
                  {filteredWorkers.map((worker) => (
                    <Fragment key={worker.employeeCode}>
                    <tr className="hover:bg-[var(--gray-50)] transition-colors group">
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => toggleExpand(worker.employeeCode)} className="p-1 text-[var(--muted)] hover:text-[var(--text)]">
                          {expandedWorker === worker.employeeCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] font-bold text-xs overflow-hidden">
                            {worker.avatarPhoto ? (
                              <img src={worker.avatarPhoto} alt={worker.name} className="w-full h-full object-cover" />
                            ) : (
                              worker.name.split(' ').map(n => n[0]).slice(0, 2).join('')
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-[var(--gray-900)]">{worker.name}</p>
                            <p className="text-[10px] text-[var(--gray-500)]">{worker.employeeCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-xs text-[var(--gray-600)]">
                        <p>{worker.email || '-'}</p>
                        <p>{worker.phone || '-'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--gray-600)]">{worker.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={worker.status} size="sm" />
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEnroll && (
                              <button onClick={() => setFaceModalWorker({ id: worker.employeeCode, name: worker.name })} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Face Scan">
                                <Camera className="w-4 h-4" />
                              </button>
                            )}
                            {worker.user ? (
                              <div className="p-1.5 text-purple-600 bg-purple-50 rounded cursor-default" title={`Has Dashboard Access (${worker.user.role})`}>
                                <ShieldCheck className="w-4 h-4" />
                              </div>
                            ) : (
                              <button onClick={() => { setGrantAccessWorker(worker); setAccessForm({ username: '', password: '', role: 'supervisor' }); }} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded" title="Grant Dashboard Access">
                                <Key className="w-4 h-4" />
                              </button>
                            )}
                            {canEnroll && (
                              <button onClick={() => openEditModal(worker)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDelete(worker.employeeCode)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {!isAdmin && (canEnroll || canDelete) && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEnroll && (
                              <>
                                <button onClick={() => setFaceModalWorker({ id: worker.employeeCode, name: worker.name })} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Face Scan">
                                  <Camera className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEditModal(worker)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDelete(worker.employeeCode)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedWorker === worker.employeeCode && (
                      <tr>
                        <td colSpan={isAdmin || canEnroll || canDelete ? 6 : 5}>
                          {renderExpandPanel(worker.employeeCode)}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataPanel>

      {isModalOpen && (
        <Modal
          title={editingWorker ? 'Edit worker' : 'Add worker'}
          size="lg"
          onClose={() => setIsModalOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setIsModalOpen(false)} className="fams-btn fams-btn-outline">
                Cancel
              </button>
              <button
                type="submit"
                form="worker-form"
                disabled={!formData.employeeCode || !formData.name || !formData.department || !formData.role}
                className="fams-btn fams-btn-primary"
              >
                {editingWorker ? 'Save changes' : 'Create worker'}
              </button>
            </>
          }
        >
          <form id="worker-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Employee code" required>
                <FormInput
                  type="text"
                  required
                  disabled={!!editingWorker}
                  value={formData.employeeCode}
                  onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                />
              </FormField>
              <FormField label="Full name" required>
                <FormInput
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Email">
                <FormInput
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Phone">
                <FormInput
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Department" required>
                <FormInput
                  type="text"
                  required
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                />
              </FormField>
              <FormField label="Role" required>
                <FormInput
                  type="text"
                  required
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Daily wage (₹)" required>
                <FormInput
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.dailyWage}
                  onChange={e => setFormData({ ...formData, dailyWage: parseFloat(e.target.value) })}
                />
              </FormField>
              <FormField label="Overtime rate (₹/hr)" required>
                <FormInput
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.overtimeRate}
                  onChange={e => setFormData({ ...formData, overtimeRate: parseFloat(e.target.value) })}
                />
              </FormField>
            </div>
            <FormField label="Assigned shift">
              <FormSelect
                value={formData.shiftId || ''}
                onChange={e => setFormData({ ...formData, shiftId: e.target.value })}
              >
                <option value="">No shift assigned</option>
                {shifts.map(shift => (
                  <option key={shift.id} value={shift.id}>{shift.name}</option>
                ))}
              </FormSelect>
            </FormField>
          </form>
        </Modal>
      )}

      {/* Face Registration Modal */}
      {faceModalWorker && (
        <FaceRegistrationModal
          employeeCode={faceModalWorker.id}
          workerName={faceModalWorker.name}
          onClose={() => setFaceModalWorker(null)}
        />
      )}

      {grantAccessWorker && (
        <Modal
          title="Grant dashboard access"
          onClose={() => setGrantAccessWorker(null)}
          footer={
            <>
              <button type="button" onClick={() => setGrantAccessWorker(null)} className="fams-btn fams-btn-outline">
                Cancel
              </button>
              <button type="submit" form="grant-access-form" className="fams-btn fams-btn-primary">
                Create account
              </button>
            </>
          }
        >
          <p className="text-[13px] text-[var(--muted)] mb-4">For {grantAccessWorker.name}</p>
          <form id="grant-access-form" onSubmit={handleGrantAccess} className="space-y-4">
            <FormField label="Username" required>
              <FormInput
                type="text"
                required
                value={accessForm.username}
                onChange={e => setAccessForm({ ...accessForm, username: e.target.value })}
                placeholder="e.g. jdoe_super"
              />
            </FormField>
            <FormField label="Password" required>
              <div className="relative">
                <FormInput
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={accessForm.password}
                  onChange={e => setAccessForm({ ...accessForm, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--muted)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FormField>
            <FormField label="Dashboard role" required>
              <FormSelect
                value={accessForm.role}
                onChange={e => setAccessForm({ ...accessForm, role: e.target.value })}
              >
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </FormSelect>
            </FormField>
          </form>
        </Modal>
      )}
    </PageShell>
  );
}
