import { roleCategory, roleOrder, roleTitle } from '@/lib/constants';
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
        const category = roleCategory(candidate);
        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={active}
            title={category === 'workflow' ? 'Workflow role' : 'Optional role'}
            className={cn(
              'rounded-full border px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-px',
              category === 'workflow'
                ? 'border-teal-500/35 bg-teal-50 text-teal-900 hover:border-teal-600/50'
                : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400',
              active && category === 'workflow' && 'border-teal-700 bg-teal-700 text-white shadow-sm',
              active && category === 'optional' && 'border-slate-700 bg-slate-800 text-white shadow-sm'
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
