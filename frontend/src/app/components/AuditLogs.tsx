import { Download } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getAuditLogs, type AuditLog } from '../../api/client';
import { PageShell, DataPanel, ErrorState } from './layout/PageShell';
import { DataTable, type DataTableColumn } from './ui/DataTable';
import { downloadCsv } from './ui/csv';
import { PrintButton } from './ui/PrintButton';

function actionClass(action: string) {
  if (action === 'Manual Override' || action === 'Manual Event') return 'fams-flag fams-flag-warning';
  if (action === 'Correction Approved') return 'fams-flag';
  if (action === 'Correction Rejected') return 'fams-flag fams-flag-danger';
  return 'fams-flag';
}

export function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (search?: string) => {
    try {
      setLoading(true);
      const data = await getAuditLogs(search);
      setLogs(data);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(searchQuery || undefined), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const formatTimestamp = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

  const columns: DataTableColumn<AuditLog>[] = useMemo(() => [
    {
      id: 'time',
      header: 'Timestamp',
      sortable: true,
      mono: true,
      sortValue: row => row.createdAt,
      render: row => formatTimestamp(row.createdAt),
    },
    {
      id: 'actor',
      header: 'Actor',
      sortable: true,
      sortValue: row => row.actor,
      render: row => <span className="font-medium">{row.actor}</span>,
    },
    {
      id: 'action',
      header: 'Action',
      sortable: true,
      sortValue: row => row.action,
      render: row => <span className={actionClass(row.action)}>{row.action}</span>,
    },
    {
      id: 'target',
      header: 'Target',
      sortable: true,
      sortValue: row => row.target,
      render: row => row.target,
    },
    {
      id: 'details',
      header: 'Details',
      render: row => <span className="block max-w-md truncate text-[var(--muted)]">{row.details}</span>,
    },
    {
      id: 'ip',
      header: 'IP',
      mono: true,
      sortable: true,
      sortValue: row => row.ipAddress,
      render: row => row.ipAddress,
    },
  ], []);

  const handleExport = () => {
    downloadCsv(
      `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Timestamp', 'Actor', 'Action', 'Target', 'Details', 'IP Address'],
      logs.map(l => [formatTimestamp(l.createdAt), l.actor, l.action, l.target, l.details, l.ipAddress]),
    );
  };

  if (error) {
    return <ErrorState title="Failed to load audit logs" message={error} onRetry={() => fetchData()} />;
  }

  return (
    <PageShell
      title="Audit log"
      description="Immutable record of system changes and user actions."
      printTitle="FAMS Audit Log"
      actions={
        <>
          <PrintButton />
          <button type="button" onClick={handleExport} data-tour="audit-export" className="fams-btn fams-btn-primary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </>
      }
    >
      <DataPanel>
        <DataTable
          columns={columns}
          data={logs}
          rowKey={row => row.id}
          loading={loading}
          emptyTitle="No audit entries found"
          emptyDescription="Try a different search term."
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: 'Search actor, action, target…',
            'data-tour': 'audit-search',
          }}
          footer={`${logs.length} record${logs.length === 1 ? '' : 's'}`}
          data-tour="audit-table"
        />
      </DataPanel>
    </PageShell>
  );
}
