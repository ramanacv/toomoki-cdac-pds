import { useOutletContext } from 'react-router-dom';
import type { AuditAlert, DashboardSummary } from '@pds/shared-types';
import type { DemoRole, DemoScenario } from '@/demo-model.js';
import type { WorkspaceState } from '@/hooks/use-workspace.js';

export type WorkspaceOutletContext = {
  role: DemoRole;
  scenario: DemoScenario;
  workspace: WorkspaceState;
  liveSummary: DashboardSummary;
  visibleAlerts: AuditAlert[];
};

export const useWorkspaceContext = () => useOutletContext<WorkspaceOutletContext>();
