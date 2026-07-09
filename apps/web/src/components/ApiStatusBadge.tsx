import type { LedgerMode } from '@/api.js';
import { cn } from '@/lib/utils';

type ApiStatusBadgeProps = {
  apiOnline: boolean;
  ledgerMode?: LedgerMode | null;
};

export function ApiStatusBadge({ apiOnline, ledgerMode }: ApiStatusBadgeProps) {
  const label = !apiOnline
    ? 'Demo data'
    : ledgerMode === 'fabric'
      ? 'Live API (Fabric)'
      : ledgerMode === 'demo'
        ? 'Live API (Demo)'
        : 'Live API';

  return (
    <span className="pill pill-soft inline-flex items-center gap-2 text-xs">
      <span className={cn('status-dot', apiOnline ? 'status-dot-live' : 'status-dot-demo')} />
      {label}
    </span>
  );
}
