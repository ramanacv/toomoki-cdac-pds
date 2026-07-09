import { useState } from 'react';
import type { DemoRole } from '@/demo-model.js';
import { roleProfiles, screenDefinitions, getRoleScreens } from '@/demo-model.js';
import { RuntimeCard } from '@/components/RuntimeCard';
import { DevAuthTokenDialog } from '@/components/DevAuthTokenDialog';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roleOrder } from '@/lib/constants';

import type { LedgerMode } from '@/api.js';

type LoginPageProps = {
  apiOnline: boolean;
  ledgerMode: LedgerMode | null;
  operatorName: string;
  role: DemoRole;
  onOperatorNameChange: (name: string) => void;
  onRoleChange: (role: DemoRole) => void;
  onSignIn: () => void;
  adminHref: string;
};

export function LoginPage({
  apiOnline,
  ledgerMode,
  operatorName,
  role,
  onOperatorNameChange,
  onRoleChange,
  onSignIn,
  adminHref
}: LoginPageProps) {
  const [localName, setLocalName] = useState(operatorName);
  const fabricOnline = apiOnline && ledgerMode === 'fabric';

  return (
    <main className="mx-auto w-full min-h-screen max-w-[880px] px-4 py-10">
      <section className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(290px,0.8fr)]">
        <div className="px-1 py-2">
          <p className="eyebrow">ViksitPDS</p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Choose a demo role to open the screens relevant to your job.
          </p>
        </div>
        <RuntimeCard
          apiOnline={apiOnline}
          title="Runtime"
          onlineLabel={fabricOnline ? 'Fabric Backend reachable' : 'Backend reachable'}
          offlineLabel="Offline demo mode"
          onlineDetail={
            fabricOnline
              ? 'Live Fabric ledger data will populate the workspace after sign in.'
              : 'Live API data will populate the workspace after sign in.'
          }
          offlineDetail="Seeded data will be used after sign in."
        />
      </section>

      {fabricOnline ? <DevAuthTokenDialog ledgerMode="fabric" apiOnline /> : null}

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
      </Panel>
    </main>
  );
}
