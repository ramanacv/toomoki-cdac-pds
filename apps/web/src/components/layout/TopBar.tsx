import { Menu } from 'lucide-react';
import type { DemoRole } from '@/demo-model.js';
import type { LedgerMode } from '@/api.js';
import { ApiStatusBadge } from '@/components/ApiStatusBadge';
import { UserMenu } from '@/components/layout/UserMenu';

type TopBarProps = {
  screenLabel: string;
  apiOnline: boolean;
  ledgerMode: LedgerMode | null;
  operatorName: string;
  role: DemoRole;
  onRoleChange: (role: DemoRole) => void;
  allowRoleSelection: boolean;
  onLogout: () => void;
  onToggleSidebar: () => void;
};

export function TopBar({
  screenLabel,
  apiOnline,
  ledgerMode,
  operatorName,
  role,
  onRoleChange,
  allowRoleSelection,
  onLogout,
  onToggleSidebar
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-8">
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={onToggleSidebar}
        className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <h1 className="text-base font-semibold tracking-tight">{screenLabel}</h1>
      <div className="ml-auto flex items-center gap-3">
        <ApiStatusBadge apiOnline={apiOnline} ledgerMode={ledgerMode} />
        <UserMenu
          operatorName={operatorName}
          role={role}
          onRoleChange={onRoleChange}
          allowRoleSelection={allowRoleSelection}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
