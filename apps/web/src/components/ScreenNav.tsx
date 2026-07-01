import { screenDefinitions, type DemoRole, type DemoScreen, getRoleScreens } from '@/demo-model.js';
import { cn } from '@/lib/utils';

type ScreenNavProps = {
  role: DemoRole;
  activeScreen: DemoScreen;
  onSelect: (screen: DemoScreen) => void;
};

export function ScreenNav({ role, activeScreen, onSelect }: ScreenNavProps) {
  const allowedScreens = getRoleScreens(role);
  return (
    <nav
      aria-label="Demo screens"
      className="my-4 grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {screenDefinitions.map((definition) => {
        const visible = allowedScreens.includes(definition.id);
        const active = activeScreen === definition.id;
        return (
          <button
            key={definition.id}
            type="button"
            disabled={!visible}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-3xl border border-border bg-card/70 p-4 text-left transition-colors',
              !visible && 'cursor-not-allowed opacity-45',
              active &&
                'border-primary/30 bg-gradient-to-b from-primary/12 to-card/86'
            )}
            onClick={() => onSelect(definition.id)}
          >
            <strong className="mb-1.5 block">{definition.label}</strong>
            <span className="block text-sm leading-snug text-muted-foreground">
              {definition.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
