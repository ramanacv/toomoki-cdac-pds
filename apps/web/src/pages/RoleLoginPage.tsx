import { useEffect, useMemo, useRef, useState } from 'react';
import { consumePendingPersonaSignIn, getCurrentIdentity, signInAs, signOut } from '@/auth-token.js';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { moduleDefinitions, type DemoModule } from '@/lib/modules.js';

export type QuickRoleLogin = {
  title: string;
  username: string;
  description: string;
  returnUrl: string;
  moduleId: DemoModule | 'admin';
};

export const quickRoleLogins: QuickRoleLogin[] = [
  {
    title: 'FCI Depot Officer',
    username: 'demo-fci',
    description: 'Originate central lots and dispatch Stage-I stock to the state godown.',
    returnUrl: '/m/supply-chain',
    moduleId: 'supply-chain'
  },
  {
    title: 'Godown Operator',
    username: 'demo-godown',
    description: 'Receive and dispatch stock at state and block godowns.',
    returnUrl: '/m/supply-chain',
    moduleId: 'supply-chain'
  },
  {
    title: 'District Supply Officer (DSO)',
    username: 'demo-department',
    description: 'Authorize Stage-II Release Orders from the state godown to the block godown.',
    returnUrl: '/m/supply-chain',
    moduleId: 'supply-chain'
  },
  {
    title: 'Block Supply Officer (BSO)',
    username: 'demo-block-office',
    description: 'Allot block-godown stock to Fair Price Shops and monitor block supply.',
    returnUrl: '/m/supply-chain',
    moduleId: 'supply-chain'
  },
  {
    title: 'Eligibility officer (DSO)',
    username: 'demo-department',
    description: 'Review synthetic card integrity cases and record mock RCMS decisions.',
    returnUrl: '/m/eligibility',
    moduleId: 'eligibility'
  },
  {
    title: 'FPS Dealer · Haveli (FPS-101)',
    username: 'demo-fps',
    description: 'Shop-bound FPS-101 (Haveli). Dealer Suresh Jadhav. Simulated AePDS/ePoS auth and issue for Haveli-tagged beneficiaries.',
    returnUrl: '/m/fps',
    moduleId: 'fps'
  },
  {
    title: 'FPS Dealer · Mulshi (FPS-202)',
    username: 'demo-fps-202',
    description: 'Shop-bound FPS-202 (Mulshi). Dealer Anita Deshmukh. Simulated AePDS/ePoS auth and issue for Mulshi-tagged beneficiaries.',
    returnUrl: '/m/fps',
    moduleId: 'fps'
  },
  {
    title: 'Auditor',
    username: 'demo-auditor',
    description: 'Read-only reconciliation, traceability, operational status, and Fabric proof evidence.',
    returnUrl: '/m/trust',
    moduleId: 'trust'
  },
  {
    title: 'Platform administrator',
    username: 'demo-platform-admin',
    description: 'Application administration and network evidence.',
    returnUrl: '/admin/overview',
    moduleId: 'admin'
  }
];

const chooserModules: Array<{ id: DemoModule | 'admin'; title: string; subtitle: string; boundary: string }> = [
  ...moduleDefinitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    subtitle: definition.subtitle,
    boundary: definition.boundary
  })),
  {
    id: 'admin',
    title: 'Platform admin',
    subtitle: 'Application administration and network evidence.',
    boundary: 'Separate from the three PDS demo modules.'
  }
];

export function RoleLoginPage() {
  const [selectedModule, setSelectedModule] = useState<DemoModule | 'admin' | null>(null);
  const [activeIdentityLabel, setActiveIdentityLabel] = useState<string | null>(null);
  const personasRef = useRef<HTMLDivElement | null>(null);
  const personas = useMemo(
    () => (selectedModule ? quickRoleLogins.filter((login) => login.moduleId === selectedModule) : []),
    [selectedModule]
  );
  const selectedTitle =
    chooserModules.find((item) => item.id === selectedModule)?.title ?? 'module';

  useEffect(() => {
    const identity = getCurrentIdentity();
    setActiveIdentityLabel(identity?.displayName ?? null);
    void consumePendingPersonaSignIn();
  }, []);

  useEffect(() => {
    if (!selectedModule || !personasRef.current) {
      return;
    }
    personasRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedModule]);

  return (
    <main id="main" className="mx-auto min-h-screen w-full max-w-[1040px] px-4 py-10">
      <section className="mb-6 px-1 py-2">
        <p className="eyebrow">ViksitPDS · local testing</p>
        <h1 className="text-3xl font-semibold tracking-tight">Choose a demo module</h1>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">
          Step 1: select a module. Step 2: choose a Keycloak persona below. This page only pre-fills the username;
          Keycloak still authenticates the user and signs the role-bearing token. Switching personas ends the current
          SSO session first so the next login cannot reuse a sticky identity.
        </p>
        {activeIdentityLabel ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-700/30 bg-teal-50 px-4 py-3 text-sm text-teal-950">
            <span>
              Signed in as <strong>{activeIdentityLabel}</strong>. Continue as another persona will log out first.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => { void signOut(); }}>
              Log out now
            </Button>
          </div>
        ) : null}
      </section>

      <Panel eyebrow="Demo modules" title="Step 1 · Select a module" pill="Module-first entry" className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {chooserModules.map((module) => {
            const selected = selectedModule === module.id;
            return (
              <button
                key={module.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedModule(module.id)}
                className={`grid gap-2 rounded-3xl border-2 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected
                    ? 'border-teal-700 bg-teal-50 shadow-sm'
                    : 'border-border bg-card/70 hover:border-teal-600/40 hover:bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{module.title}</h2>
                  {selected ? (
                    <span className="shrink-0 rounded-md bg-teal-700 px-2 py-0.5 text-xs font-medium text-white">
                      Selected
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Select</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{module.subtitle}</p>
                <p className="text-xs text-muted-foreground">{module.boundary}</p>
                {selected ? (
                  <p className="text-sm font-medium text-teal-900">Next: choose a persona below ↓</p>
                ) : null}
              </button>
            );
          })}
        </div>
        {!selectedModule ? (
          <p className="mt-5 rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Click a module card to reveal its Keycloak personas.
          </p>
        ) : null}
        <p className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Controlled PoC: ViksitPDS complements SMART-PDS/RCMS, IAeSCM/state SCM, and AePDS/ePoS.
          Fixture-backed actions simulate authoritative source-system events; they are not live state integrations.
        </p>
      </Panel>

      {selectedModule ? (
        <div ref={personasRef} className="scroll-mt-6">
          <Panel
            eyebrow="Step 2 · Keycloak personas"
            title={`Personas for ${selectedTitle}`}
            pill="Authorization Code + PKCE"
            className="mt-6 p-6"
          >
            <div className="grid gap-4 md:grid-cols-2">
              {personas.map((login) => (
                <article
                  key={`${login.moduleId}-${login.username}-${login.returnUrl}`}
                  className="grid gap-3 rounded-3xl border border-border bg-card/70 p-5"
                >
                  <div>
                    <h2 className="font-semibold">{login.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{login.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <code className="rounded-lg bg-muted px-2 py-1 text-xs">{login.username}</code>
                    <Button
                      type="button"
                      onClick={() => {
                        void signInAs(login.username, login.returnUrl);
                      }}
                    >
                      Continue as {login.title}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Passwords are never stored or submitted by this page. Enter the configured local demo password on Keycloak.
              Prefer Continuations from this page over clearing sessionStorage alone — Continue ends the Keycloak SSO
              session before the next persona login.
            </p>
          </Panel>
        </div>
      ) : null}
    </main>
  );
}
