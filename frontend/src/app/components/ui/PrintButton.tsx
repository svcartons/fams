import { Printer } from 'lucide-react';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fams-btn fams-btn-outline fams-no-print"
    >
      <Printer className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
