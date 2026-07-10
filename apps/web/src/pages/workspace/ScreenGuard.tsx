import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import type { DemoScreen } from '@/demo-model.js';
import { getDefaultScreen, getRoleScreens } from '@/demo-model.js';
import { screenPath } from '@/lib/screen-routes.js';
import { parseRole } from '@/lib/url-state.js';

export function DefaultScreenRedirect() {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const role = parseRole(params.get('role'));
  return <Navigate to={screenPath(getDefaultScreen(role), search)} replace />;
}

export function ScreenGuard({ screen, children }: { screen: DemoScreen; children: ReactNode }) {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const role = parseRole(params.get('role'));

  if (!getRoleScreens(role).includes(screen)) {
    return <Navigate to={screenPath(getDefaultScreen(role), search)} replace />;
  }
  return children;
}
