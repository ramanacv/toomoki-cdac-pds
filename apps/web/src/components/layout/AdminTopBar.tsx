import { Menu } from 'lucide-react';
import { ApiStatusBadge } from '@/components/ApiStatusBadge';
import { Button } from '@/components/ui/button';

type AdminTopBarProps = {
  screenLabel: string;
  apiOnline: boolean;
  onToggleSidebar: () => void;
};

export function AdminTopBar({ screenLabel, apiOnline, onToggleSidebar }: AdminTopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-8">
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={onToggleSidebar}
        className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <h1 className="text-base font-semibold tracking-tight">{screenLabel}</h1>
      <div className="ml-auto flex items-center gap-3">
        <ApiStatusBadge apiOnline={apiOnline} />
        <Button variant="secondary" size="sm" asChild>
          <a href="/">Back to workspace</a>
        </Button>
      </div>
    </header>
  );
}
