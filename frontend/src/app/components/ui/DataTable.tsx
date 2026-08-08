import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { EmptyState } from '../layout/PageShell';

export type SortDir = 'asc' | 'desc';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  sortable?: boolean;
  className?: string;
  cellClassName?: string;
  mono?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick?: () => void; to?: string };
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    'data-tour'?: string;
  };
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  'data-tour'?: string;
}

function compareValues(a: string | number, b: string | number, dir: SortDir) {
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  const left = String(a).toLowerCase();
  const right = String(b).toLowerCase();
  if (left === right) return 0;
  const result = left < right ? -1 : 1;
  return dir === 'asc' ? result : -result;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 5,
  emptyTitle = 'No records',
  emptyDescription,
  emptyAction,
  search,
  toolbar,
  footer,
  className = '',
  'data-tour': dataTour,
}: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedData = useMemo(() => {
    if (!sortCol) return data;
    const column = columns.find(c => c.id === sortCol);
    if (!column?.sortValue) return data;

    return [...data].sort((a, b) => {
      const av = column.sortValue!(a) ?? '';
      const bv = column.sortValue!(b) ?? '';
      return compareValues(av, bv, sortDir);
    });
  }, [columns, data, sortCol, sortDir]);

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !column.sortValue) return;
    if (sortCol === column.id) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(column.id);
      setSortDir('asc');
    }
  };

  const showToolbar = search || toolbar;

  return (
    <div className={className} data-tour={dataTour}>
      {showToolbar && (
        <div className="p-3 border-b border-[var(--border)] flex flex-col sm:flex-row gap-2">
          {search && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
              <input
                type="text"
                placeholder={search.placeholder ?? 'Search…'}
                value={search.value}
                onChange={e => search.onChange(e.target.value)}
                data-tour={search['data-tour']}
                className="fams-input fams-input-with-icon"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="fams-table-scroll overflow-x-auto" tabIndex={0} aria-label="Scrollable data table">
        <table className="fams-table">
          <thead>
            <tr>
              {columns.map(column => {
                const active = sortCol === column.id;
                return (
                  <th key={column.id} className={column.className}>
                    {column.sortable && column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-[var(--text)]"
                      >
                        {column.header}
                        {active ? (
                          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              Array(skeletonRows).fill(0).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map(col => (
                    <td key={col.id}>
                      <div className="fams-skeleton h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </td>
              </tr>
            ) : (
              sortedData.map(row => (
                <tr key={rowKey(row)}>
                  {columns.map(column => (
                    <td
                      key={column.id}
                      className={`${column.mono ? 'fams-mono' : ''} ${column.cellClassName ?? ''}`.trim()}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {footer && (
        <div className="px-4 py-2 border-t border-[var(--border)] text-[12px] text-[var(--muted)]">
          {footer}
        </div>
      )}
    </div>
  );
}
