import { Link, useLocation } from 'react-router-dom';
import { Panel } from '@/components/Panel.js';
import { Button } from '@/components/ui/button.js';
import { buildWorkflowSteps, getRoleProfile, screenDefinitions } from '@/demo-model.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';
import { WorkflowTimeline } from '@/components/WorkflowTimeline.js';
import {
  getModuleDefinition,
  getModuleScreensForRole,
  type DemoModule
} from '@/lib/modules.js';
import { screenPath } from '@/lib/screen-routes.js';
import { getCurrentIdentity } from '@/auth-token.js';

type ModuleHomePageProps = {
  moduleId: DemoModule;
};

export function ModuleHomePage({ moduleId }: ModuleHomePageProps) {
  const { role, scenario, workspace, visibleAlerts } = useWorkspaceContext();
  const { search } = useLocation();
  const module = getModuleDefinition(moduleId);
  const roleProfile = getRoleProfile(role);
  const screens = getModuleScreensForRole(moduleId, role);
  const identity = getCurrentIdentity();
  const fpsId = identity?.stakeholderId ?? (role === 'FPS' ? 'FPS-101' : undefined);

  const ctaScreens = screens
    .map((screenId) => screenDefinitions.find((item) => item.id === screenId))
    .filter((item): item is (typeof screenDefinitions)[number] => Boolean(item));

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">Module home</p>
        <h2 className="text-3xl font-semibold tracking-tight">{module.title} home</h2>
        <p className="mt-1 max-w-3xl leading-relaxed text-muted-foreground">{module.subtitle}</p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{module.boundary}</p>
      </header>

      <Panel eyebrow="Your journey" title={roleProfile.title} pill="Module home">
        <p className="text-sm text-muted-foreground">{roleProfile.summary}</p>
        {moduleId === 'fps' && fpsId && (() => {
          const shop = workspace.stakeholders.find((item) => item.stakeholderId === fpsId);
          return (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Assigned shop</dt>
                <dd className="font-semibold">{shop?.shopNo ?? fpsId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dealer</dt>
                <dd className="font-semibold">{shop?.dealerName ?? 'Assigned FPS dealer'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Block / Tehsil</dt>
                <dd className="font-semibold">
                  {[shop?.blockName, shop?.tehsilName].filter(Boolean).join(' / ') || '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd className="font-semibold">{shop?.location ?? shop?.district ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pending receipts</dt>
                <dd className="font-semibold">
                  {workspace.allocations.filter((item) => item.fpsId === fpsId && item.status === 'ALLOCATED').length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recent distributions</dt>
                <dd className="font-semibold">
                  {workspace.distributions.filter((item) => item.fpsId === fpsId).length}
                </dd>
              </div>
            </dl>
          );
        })()}
        {moduleId === 'eligibility' && (
          <p className="mt-3 text-sm text-muted-foreground">
            Open eligibility review to screen synthetic panel beneficiaries (name, address, demo Aadhaar, family),
            split across FPS-101 (Haveli) and FPS-202 (Mulshi). Entitlement is blocked only after an authorized
            suspension or cancellation. Fabric proofs remain hash-only.
          </p>
        )}
        {moduleId === 'trust' && (
          <p className="mt-3 text-sm text-muted-foreground">
            Open alerts: {visibleAlerts.length}. Use dashboard, audit, and verify to inspect custody and distribution
            evidence without mutating operational stock.
          </p>
        )}
      </Panel>

      <Panel eyebrow="Continue" title="Screens in this module" pill={`${ctaScreens.length} available`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {ctaScreens.map((definition) => (
            <article
              key={definition.id}
              className="grid gap-2 rounded-2xl border border-border bg-card/70 p-4"
            >
              <div>
                <h3 className="font-semibold">{definition.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>
              </div>
              <Button asChild variant="outline" className="justify-self-start">
                <Link to={screenPath(definition.id, search)}>Open {definition.label}</Link>
              </Button>
            </article>
          ))}
          {ctaScreens.length === 0 && (
            <p className="text-sm text-muted-foreground">No screens are available for this role in this module.</p>
          )}
        </div>
      </Panel>

      {moduleId === 'supply-chain' && (
        <WorkflowTimeline steps={buildWorkflowSteps(scenario)} />
      )}
    </div>
  );
}
