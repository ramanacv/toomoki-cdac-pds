import type { WorkflowStep } from '@/demo-model.js';
import { Panel } from '@/components/Panel';
import { cn } from '@/lib/utils';

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <Panel
      eyebrow="Workflow"
      title="Custody to delivery"
      pill={`${steps.length} stages`}
      lead="How a ration lot moves from central allocation to household delivery."
    >
      <ol className="grid gap-3.5">
        {steps.map((step, index) => {
          const blocked = step.state === 'blocked';
          return (
            <li key={step.id} className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-semibold',
                  blocked
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
              <div>
                <strong className="mb-1 flex flex-wrap items-center gap-2">
                  {step.title}
                  {blocked && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Blocked in this scenario
                    </span>
                  )}
                </strong>
                <p className="leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
