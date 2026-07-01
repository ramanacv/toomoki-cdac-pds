import { useState } from 'react';
import type { DemoRole } from '@/demo-model.js';
import { roleProfiles, screenDefinitions, getRoleScreens } from '@/demo-model.js';
import { RuntimeCard } from '@/components/RuntimeCard';
import { Panel } from '@/components/Panel';
import { RoleTabs } from '@/components/RoleTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roleOrder } from '@/lib/constants';

type LoginPageProps = {
  apiOnline: boolean;
  operatorName: string;
  role: DemoRole;
  onOperatorNameChange: (name: string) => void;
  onRoleChange: (role: DemoRole) => void;
  onSignIn: () => void;
  adminHref: string;
};

export function LoginPage({
  apiOnline,
  operatorName,
  role,
  onOperatorNameChange,
  onRoleChange,
  onSignIn,
  adminHref
}: LoginPageProps) {
  const [localName, setLocalName] = useState(operatorName);

  return (
    <main className="mx-auto w-full min-h-screen max-w-[1240px] px-4 py-10">
      <section className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <div className="surface-blur relative overflow-hidden rounded-3xl p-8">
          <p className="eyebrow">PDS-Chain MVP login</p>
          <h1 className="max-w-[13ch] text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Sign in to the role-aware demo workspace.
          </h1>
          <p className="mt-4 max-w-[66ch] leading-relaxed text-muted-foreground">
            Use a demo role to open the screens relevant to your job: procurement, godown, FPS,
            department, or audit.
          </p>
        </div>
        <RuntimeCard
          apiOnline={apiOnline}
          title="Runtime"
          onlineLabel="Backend reachable"
          offlineLabel="Offline demo mode"
          onlineDetail="Live API data will populate the workspace after sign in."
          offlineDetail="Seeded data will be used after sign in."
        />
      </section>

      <Panel
        eyebrow="Operator"
        title="Choose a role to continue"
        pill={roleProfiles[role].title}
        className="p-6"
      >
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="operator-name">Operator name</Label>
            <Input
              id="operator-name"
              value={localName}
              onChange={(event) => {
                setLocalName(event.target.value);
                onOperatorNameChange(event.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => onRoleChange(value as DemoRole)}
            >
              <SelectTrigger id="login-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOrder.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {roleProfiles[candidate].title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {getRoleScreens(role).map((screenId) => {
            const definition = screenDefinitions.find((item) => item.id === screenId)!;
            return (
              <article
                key={screenId}
                className="grid gap-1.5 rounded-3xl border border-border bg-card/70 p-4"
              >
                <strong>{definition.label}</strong>
                <span className="text-sm text-muted-foreground">{definition.description}</span>
              </article>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button type="button" onClick={onSignIn}>
            Enter demo workspace
          </Button>
          <Button variant="secondary" asChild>
            <a href={adminHref}>Open admin console</a>
          </Button>
        </div>

        <div className="mt-6">
          <RoleTabs role={role} onChange={onRoleChange} />
        </div>
      </Panel>
    </main>
  );
}
