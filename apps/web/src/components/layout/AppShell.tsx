import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { DemoRole, DemoScenario } from '@/demo-model.js';
import type { LedgerMode } from '@/api.js';
import { screenDefinitions } from '@/demo-model.js';
import { routeToScreen } from '@/lib/screen-routes.js';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { DemoControlsDrawer } from '@/components/layout/DemoControlsDrawer';

type AppShellProps = {
  role: DemoRole;
  scenario: DemoScenario;
  operatorName: string;
  apiOnline: boolean;
  ledgerMode: LedgerMode | null;
  onRoleChange: (role: DemoRole) => void;
  onScenarioChange: (scenario: DemoScenario) => void;
  onLogout: () => void;
  offlineMode: boolean;
  children: ReactNode;
};

export function AppShell({
  role,
  scenario,
  operatorName,
  apiOnline,
  ledgerMode,
  onRoleChange,
  onScenarioChange,
  onLogout,
  offlineMode,
  children
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);
  const { pathname } = useLocation();

  const screen = routeToScreen(pathname.replace(/^\//, ''));
  const screenLabel =
    screenDefinitions.find((definition) => definition.id === screen)?.label ?? 'Workspace';

  const openDemoControls = () => {
    setSidebarOpen(false);
    setDemoControlsOpen(true);
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar role={role} onOpenDemoControls={openDemoControls} />
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-background">
            <Sidebar
              role={role}
              onNavigate={() => setSidebarOpen(false)}
              onOpenDemoControls={openDemoControls}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <TopBar
          screenLabel={screenLabel}
          apiOnline={apiOnline}
          ledgerMode={ledgerMode}
          operatorName={operatorName}
          role={role}
          onRoleChange={onRoleChange}
          allowRoleSelection={offlineMode}
          onLogout={onLogout}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>

      <DemoControlsDrawer
        open={demoControlsOpen}
        onOpenChange={setDemoControlsOpen}
        role={role}
        scenario={scenario}
        apiOnline={apiOnline}
        onScenarioChange={onScenarioChange}
      />
    </div>
  );
}
