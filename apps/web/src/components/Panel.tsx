import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  eyebrow: string;
  title: string;
  pill?: string | undefined;
  pillVariant?: 'default' | 'soft' | undefined;
  lead?: string | undefined;
  wide?: boolean | undefined;
};

export function Panel({
  eyebrow,
  title,
  pill,
  pillVariant = 'soft',
  lead,
  wide,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Card
      className={cn('rounded-3xl p-6', wide && 'pb-7', className)}
      {...props}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow compact">{eyebrow}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        {pill && (
          <Badge variant={pillVariant === 'soft' ? 'secondary' : 'default'} className="shrink-0">
            {pill}
          </Badge>
        )}
      </div>
      {lead && <p className="mb-4 leading-relaxed text-muted-foreground">{lead}</p>}
      {children}
    </Card>
  );
}
