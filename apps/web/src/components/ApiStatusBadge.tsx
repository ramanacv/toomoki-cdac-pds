import { cn } from '@/lib/utils';

type ApiStatusBadgeProps = {
  apiOnline: boolean;
};

export function ApiStatusBadge({ apiOnline }: ApiStatusBadgeProps) {
  return (
    <span className="pill pill-soft inline-flex items-center gap-2 text-xs">
      <span className={cn('status-dot', apiOnline ? 'status-dot-live' : 'status-dot-demo')} />
      {apiOnline ? 'Live API' : 'Demo data'}
    </span>
  );
}
