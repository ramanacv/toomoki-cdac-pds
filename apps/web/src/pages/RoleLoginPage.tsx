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
  { title: 'Management', username: 'demo-management', description: 'Operational overview and aggregate monitoring.', returnUrl: '/dashboard' },
  { title: 'Department', username: 'demo-department', description: 'Entitlements and Stage-II movement authorization.', returnUrl: '/workbench' },
  { title: 'Procurement', username: 'demo-procurement', description: 'Lot creation and procurement dispatch.', returnUrl: '/workbench' },
  { title: 'FCI', username: 'demo-fci', description: 'Central depot receipt and onward dispatch.', returnUrl: '/workbench' },
  { title: 'Godown', username: 'demo-godown', description: 'Godown receipts, custody, and allocations.', returnUrl: '/workbench' },
  { title: 'Fair Price Shop', username: 'demo-fps', description: 'FPS receipt, authentication, and distribution.', returnUrl: '/workbench' },
  { title: 'Auditor', username: 'demo-auditor', description: 'Traceability, proofs, and audit alerts.', returnUrl: '/dashboard' },
  { title: 'Platform administrator', username: 'demo-platform-admin', description: 'Application administration and network evidence.', returnUrl: '/admin/overview' }
];

export function RoleLoginPage() {
  return (
    <main id="main" className="mx-auto min-h-screen w-full max-w-[1040px] px-4 py-10">
      <section className="mb-6 px-1 py-2">
        <p className="eyebrow">ViksitPDS · local testing</p>
        <h1 className="text-3xl font-semibold tracking-tight">Quick role login</h1>
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
      </Panel>
    </main>
  );
}
