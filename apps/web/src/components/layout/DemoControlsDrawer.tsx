import type { DemoRole, DemoScenario } from '@/demo-model.js';
import { getRoleProfile, getScenarioTagline, getScenarioTitle } from '@/demo-model.js';
import { RuntimeCard } from '@/components/RuntimeCard';
import { ScenarioSelector } from '@/components/ScenarioSelector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

type DemoControlsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: DemoRole;
  scenario: DemoScenario;
  apiOnline: boolean;
  onScenarioChange: (scenario: DemoScenario) => void;
};

export function DemoControlsDrawer({
  open,
  onOpenChange,
  role,
  scenario,
  apiOnline,
  onScenarioChange
}: DemoControlsDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demo controls</DialogTitle>
          <DialogDescription>
            Storyboard the demo by switching scenarios; the runtime card shows which data source is
            active.
          </DialogDescription>
        </DialogHeader>
        <ScenarioSelector
          scenario={scenario}
          scenarioTitle={getScenarioTitle(scenario)}
          scenarioTagline={getScenarioTagline(scenario)}
          roleTitle={getRoleProfile(role).title}
          apiOnline={apiOnline}
          onChange={onScenarioChange}
        />
        <RuntimeCard
          apiOnline={apiOnline}
          title="Runtime"
          onlineLabel="Live API available"
          offlineLabel="Demo fallback active"
          onlineDetail="Connected to the backend contract."
          offlineDetail="Using seeded operational data and local scenario logic."
        />
      </DialogContent>
    </Dialog>
  );
}
