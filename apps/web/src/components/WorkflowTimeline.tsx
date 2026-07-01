import type { WorkflowStep } from '@/demo-model.js';
import { Panel } from '@/components/Panel';
import { cn } from '@/lib/utils';

const stateDot: Record<WorkflowStep['state'], string> = {
  complete: 'bg-gradient-to-br from-emerald-500 to-green-400 shadow-[0_0_0_6px_rgba(34,197,94,0.12)]',
  active: 'bg-gradient-to-br from-primary to-green-500 shadow-[0_0_0_6px_rgba(15,118,110,0.12)]',
  blocked: 'bg-gradient-to-br from-amber-600 to-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.12)]',
  pending: 'bg-slate-400 shadow-[0_0_0_6px_rgba(148,163,184,0.13)]'
};

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <Panel eyebrow="Workflow" title="Custody to delivery" pill="Audit-visible">
      <ol className="grid gap-3.5">
        {steps.map((step) => (
          <li key={step.id} className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-3">
            <span className={cn('mt-1.5 h-3 w-3 flex-none rounded-full', stateDot[step.state])} />
            <div>
              <strong className="mb-1 block">{step.title}</strong>
              <p className="leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
