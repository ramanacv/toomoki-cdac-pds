import { signInAs } from '@/auth-token.js';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';

export type QuickRoleLogin = {
  title: string;
  username: string;
  description: string;
  returnUrl: string;
};

export const quickRoleLogins: QuickRoleLogin[] = [
  {
    title: 'FCI Depot Officer',
    username: 'demo-fci',
    description: 'Originate central lots and dispatch Stage-I stock to the state godown.',
    returnUrl: '/workbench'
  },
  {
    title: 'Godown Operator',
    username: 'demo-godown',
    description: 'Receive and dispatch stock at state and block godowns.',
    returnUrl: '/workbench'
  },
  {
    title: 'District Supply Officer (DSO)',
    username: 'demo-department',
    description: 'Authorize Stage-II Release Orders from the state godown to the block godown.',
    returnUrl: '/workbench'
  },
  {
    title: 'Block Supply Officer (BSO)',
    username: 'demo-block-office',
    description: 'Allot block-godown stock to Fair Price Shops and monitor block supply.',
    returnUrl: '/workbench'
  },
  {
    title: 'FPS Dealer',
    username: 'demo-fps',
    description: 'Shop-bound FPS-101 workspace. Authentication and ration issue are clearly simulated AePDS/ePoS events.',
    returnUrl: '/workbench'
  },
  {
    title: 'Auditor',
    username: 'demo-auditor',
    description: 'Read-only reconciliation, traceability, operational status, and Fabric proof evidence.',
    returnUrl: '/dashboard'
  },
  {
    title: 'Platform administrator',
    username: 'demo-platform-admin',
    description: 'Application administration and network evidence.',
    returnUrl: '/admin/overview'
  }
];

export function RoleLoginPage() {
  return (
    <main id="main" className="mx-auto min-h-screen w-full max-w-[1040px] px-4 py-10">
      <section className="mb-6 px-1 py-2">
        <p className="eyebrow">ViksitPDS · local testing</p>
        <h1 className="text-3xl font-semibold tracking-tight">Choose an entry journey</h1>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">
          Choose a demo persona. Keycloak still authenticates the user and signs the role-bearing token; this page only pre-fills the username.
        </p>
      </section>

      <Panel
        eyebrow="Keycloak personas"
        title="Select a role"
        pill="Authorization Code + PKCE"
        className="p-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {quickRoleLogins.map((login) => (
            <article key={login.username} className="grid gap-3 rounded-3xl border border-border bg-card/70 p-5">
              <div>
                <h2 className="font-semibold">{login.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{login.description}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <code className="rounded-lg bg-muted px-2 py-1 text-xs">{login.username}</code>
                <Button
                  type="button"
                  onClick={() => { void signInAs(login.username, login.returnUrl); }}
                >
                  Continue as {login.title}
                </Button>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Passwords are never stored or submitted by this page. Enter the configured local demo password on Keycloak.
        </p>
        <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Controlled PoC: ViksitPDS complements SMART-PDS/RCMS, IAeSCM/state SCM, and AePDS/ePoS.
          Fixture-backed actions simulate authoritative source-system events; they are not live state integrations.
        </p>
      </Panel>
    </main>
  );
}
