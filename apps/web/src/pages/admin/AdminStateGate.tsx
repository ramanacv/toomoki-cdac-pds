import type { ReactNode } from 'react';
import { Panel } from '@/components/Panel.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { useAdminContext } from '@/hooks/use-admin-context.js';

export function AdminStateGate({ children }: { children: (overview: NonNullable<ReturnType<typeof useAdminContext>['overview']>) => ReactNode }) {
  const { overview, loading, error } = useAdminContext();

  if (loading) {
    return (
      <Panel eyebrow="Status" title="Loading admin overview" wide>
        <p className="leading-relaxed text-muted-foreground">Loading admin overview…</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!overview) {
    return null;
  }

  return <>{children(overview)}</>;
}
