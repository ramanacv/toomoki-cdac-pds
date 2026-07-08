import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { adminRouteToScreen, adminScreenDefinitions } from '@/lib/admin-model.js';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopBar } from '@/components/layout/AdminTopBar';

type AdminShellProps = {
  apiOnline: boolean;
  children: ReactNode;
};

export function AdminShell({ apiOnline, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  const segment = pathname.replace(/^\/admin\/?/, '');
  const screen = adminRouteToScreen(segment);
  const screenLabel =
    adminScreenDefinitions.find((definition) => definition.id === screen)?.label ?? 'Admin console';

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <a href="#admin-main" className="skip-link">
        Skip to admin content
      </a>
      <aside className="hidden md:block">
        <div className="sticky top-0 h-screen">
          <AdminSidebar />
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
            <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <AdminTopBar
          screenLabel={screenLabel}
          apiOnline={apiOnline}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        <main id="admin-main" className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
