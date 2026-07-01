import { cn } from '@/lib/utils';

export type RuntimeStatus = 'live' | 'demo' | 'offline';

type RuntimeCardProps = {
  apiOnline: boolean;
  title?: string;
  onlineLabel: string;
  offlineLabel: string;
  onlineDetail: string;
  offlineDetail: string;
  detail?: string;
};

export function RuntimeCard({
  apiOnline,
  onlineLabel,
  offlineLabel,
  onlineDetail,
  offlineDetail,
  detail
}: RuntimeCardProps) {
  const status: RuntimeStatus = apiOnline ? 'live' : 'demo';
  return (
    <aside className="surface-blur flex items-start gap-4 rounded-3xl p-6">
      <span
        className={cn(
          'status-dot',
          status === 'live' ? 'status-dot-live' : 'status-dot-demo'
        )}
      />
      <div className="space-y-1">
        <p className="eyebrow compact">Runtime</p>
        <strong className="block text-lg font-semibold tracking-tight">
          {apiOnline ? onlineLabel : offlineLabel}
        </strong>
        <p className="text-sm text-muted-foreground">{detail ?? (apiOnline ? onlineDetail : offlineDetail)}</p>
      </div>
    </aside>
  );
}
