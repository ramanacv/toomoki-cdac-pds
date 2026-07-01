import { cn } from '@/lib/utils';

type Entry = { label: string; value: React.ReactNode };

export function DefinitionList({ entries, className }: { entries: Entry[]; className?: string }) {
  return (
    <dl className={cn('mt-3.5 grid grid-cols-2 gap-2.5', className)}>
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{entry.label}</dt>
          <dd className="mt-1 font-bold break-all">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CardTopline({
  left,
  right,
  tone = 'default'
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  tone?: 'default' | 'low' | 'medium' | 'high';
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <strong>{left}</strong>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-semibold',
          tone === 'low' && 'bg-success/12 text-success',
          tone === 'medium' && 'bg-warning/15 text-warning',
          tone === 'high' && 'bg-destructive/12 text-destructive',
          tone === 'default' && 'bg-secondary/10 text-secondary'
        )}
      >
        {right}
      </span>
    </div>
  );
}

export function EntityCard({
  children,
  className,
  tone
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'low' | 'medium' | 'high';
}) {
  return (
    <article
      className={cn(
        'rounded-3xl border border-border bg-card/75 p-4',
        tone === 'low' && 'border-success/20',
        tone === 'medium' && 'border-warning/20',
        tone === 'high' && 'border-destructive/25',
        className
      )}
    >
      {children}
    </article>
  );
}
