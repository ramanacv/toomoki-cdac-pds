import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { DemoScreen } from '@/demo-model.js';
import { getRoleScreens } from '@/demo-model.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';
import { getDefaultPath } from '@/lib/modules.js';

export function DefaultScreenRedirect() {
  const { search } = useLocation();
  const { role } = useWorkspaceContext();
  return <Navigate to={{ pathname: getDefaultPath(role), search }} replace />;
}

export function ScreenGuard({ screen, children }: { screen: DemoScreen; children: ReactNode }) {
  const { search } = useLocation();
  const { role } = useWorkspaceContext();

  if (!getRoleScreens(role).includes(screen)) {
    return <Navigate to={{ pathname: getDefaultPath(role), search }} replace />;
  }
  return children;
}
