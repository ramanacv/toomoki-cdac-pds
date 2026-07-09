import type { ParticipationMode } from '@/lib/constants';
import { participationLabel } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const participationDotClass: Record<ParticipationMode, string> = {
  active: 'bg-success',
  passive: 'bg-muted-foreground/45'
};

export const participationCardClass: Record<ParticipationMode, string> = {
  active: 'border-success/25 bg-success/[0.04]',
  passive: 'border-border bg-muted/20'
};

export const participationTriggerClass: Record<ParticipationMode, string> = {
  active: 'border-l-[3px] border-l-success',
  passive: 'border-l-[3px] border-l-muted-foreground/35'
};

export function ParticipationDot({
  mode,
  className
}: {
  mode: ParticipationMode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', participationDotClass[mode], className)}
    />
  );
}

export function ParticipationBadge({ mode }: { mode: ParticipationMode }) {
  return (
    <Badge variant={mode === 'active' ? 'success' : 'secondary'} className="text-[10px] uppercase tracking-wide">
      {participationLabel[mode]}
    </Badge>
  );
}
