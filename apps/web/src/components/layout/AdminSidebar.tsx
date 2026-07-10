import { NavLink } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { adminScreenDefinitions, adminScreenPath } from '@/lib/admin-model.js';
import { cn } from '@/lib/utils';

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6 border-r border-border bg-card/60 px-4 py-6">
      <div className="px-2">
        <span className="pill">ViksitPDS</span>
        <p className="eyebrow compact mt-3">Admin console</p>
      </div>

      <nav aria-label="Admin sections" className="flex flex-1 flex-col gap-1">
        {adminScreenDefinitions.map((definition) => (
          <NavLink
            key={definition.id}
            to={adminScreenPath(definition.id)}
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
        <a
          href="/"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </a>
      </div>
    </div>
  );
}
