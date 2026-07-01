import { scenarioOptions } from '@/lib/constants';
import type { DemoScenario } from '@/demo-model.js';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ScenarioSelectorProps = {
  scenario: DemoScenario;
  scenarioTitle: string;
  scenarioTagline: string;
  roleTitle: string;
  apiOnline: boolean;
  onChange: (scenario: DemoScenario) => void;
};

export function ScenarioSelector({
  scenario,
  scenarioTitle,
  scenarioTagline,
  roleTitle,
  apiOnline,
  onChange
}: ScenarioSelectorProps) {
  const cards = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {scenarioOptions.map((option) => {
        const active = option.id === scenario;
        return (
          <button
            key={option.id}
            type="button"
            disabled={apiOnline}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'grid gap-1.5 rounded-3xl border border-border bg-card/70 p-4 text-left transition-all hover:-translate-y-px',
              !apiOnline && 'cursor-pointer',
              apiOnline && 'cursor-not-allowed opacity-60',
              active && 'border-primary/35 bg-gradient-to-b from-primary/12 to-card/86'
            )}
          >
            <strong>{option.label}</strong>
            <span className="text-sm text-muted-foreground">{option.short}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Panel
      eyebrow="Scenario"
      title={scenarioTitle}
      pill={roleTitle}
      lead={scenarioTagline}
    >
      {apiOnline ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Tooltip.Trigger needs a single child that accepts props; the disabled
                  grid is wrapped so the tooltip can anchor while buttons stay disabled. */}
              <div className="cursor-not-allowed">{cards}</div>
            </TooltipTrigger>
            <TooltipContent>
              Scenario overrides are demo-only. Live API data is shown — switch to demo
              mode (VITE_DATA_SOURCE=mock or stop the API) to drive scenario storyboards.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        cards
      )}
      {apiOnline && (
        <Badge variant="secondary" className="mt-3">
          Live API data shown
        </Badge>
      )}
    </Panel>
  );
}
