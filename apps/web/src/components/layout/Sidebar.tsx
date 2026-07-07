import { NavLink, useLocation } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import type { DemoRole } from '@/demo-model.js';
import { getRoleScreens, screenDefinitions } from '@/demo-model.js';
import { screenPath } from '@/lib/screen-routes.js';
import { cn } from '@/lib/utils';

type SidebarProps = {
  role: DemoRole;
  onNavigate?: () => void;
  onOpenDemoControls: () => void;
};

export function Sidebar({ role, onNavigate, onOpenDemoControls }: SidebarProps) {
  const { search } = useLocation();
  const allowedScreens = getRoleScreens(role);
  const items = screenDefinitions.filter((definition) => allowedScreens.includes(definition.id));

  return (
    <div className="flex h-full flex-col gap-6 border-r border-border bg-card/60 px-4 py-6">
      <div className="px-2">
        <span className="pill">PDS-Chain</span>
        <p className="eyebrow compact mt-3">Ration traceability</p>
      </div>

      <nav aria-label="Workspace sections" className="flex flex-1 flex-col gap-1">
        {items.map((definition) => (
          <NavLink
            key={definition.id}
            to={screenPath(definition.id, search)}
            title={definition.description}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                isActive && 'border border-primary/30 bg-gradient-to-b from-primary/12 to-card/86 text-foreground'
              )
            }
          >
            {definition.label}
          </NavLink>
        ))}
      </nav>

      <div className="grid gap-1 border-t border-border pt-4">
        <button
          type="button"
          onClick={onOpenDemoControls}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Demo controls
        </button>
        <a
          href="/admin"
          className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          Admin console
        </a>
      </div>
    </div>
  );
}
