import { roleOrder, roleTitle } from '@/lib/constants';
import type { DemoRole } from '@/demo-model.js';
import { cn } from '@/lib/utils';

type RoleTabsProps = {
  role: DemoRole;
  onChange: (role: DemoRole) => void;
};

export function RoleTabs({ role, onChange }: RoleTabsProps) {
  return (
    <div className="mt-6 flex flex-wrap gap-2.5" role="tablist" aria-label="Demo roles">
      {roleOrder.map((candidate) => {
        const active = candidate === role;
        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-full border border-border bg-card/70 px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:-translate-y-px',
              active &&
                'border-primary/30 bg-gradient-to-br from-primary/16 to-primary/8 text-primary'
            )}
            onClick={() => onChange(candidate)}
          >
            {roleTitle(candidate)}
          </button>
        );
      })}
    </div>
  );
}
