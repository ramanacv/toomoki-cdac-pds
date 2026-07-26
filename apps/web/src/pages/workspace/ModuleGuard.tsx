import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';
import { getDefaultPath, roleCanAccessModule, type DemoModule } from '@/lib/modules.js';

export function ModuleGuard({ moduleId, children }: { moduleId: DemoModule; children: ReactNode }) {
  const { search } = useLocation();
  const { role } = useWorkspaceContext();

  if (!roleCanAccessModule(role, moduleId)) {
    return <Navigate to={{ pathname: getDefaultPath(role), search }} replace />;
  }

  return children;
}
