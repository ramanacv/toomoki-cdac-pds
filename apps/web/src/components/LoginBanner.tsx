import { Panel } from '@/components/Panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type LoginBannerProps = {
  operatorName: string;
  roleTitle: string;
  onLogout: () => void;
  adminHref: string;
};

export function LoginBanner({ operatorName, roleTitle, onLogout, adminHref }: LoginBannerProps) {
  return (
    <Panel eyebrow="Signed in as" title={operatorName} wide>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="secondary" onClick={onLogout}>
          Log out
        </Button>
        <Button variant="secondary" asChild>
          <a href={adminHref}>Admin console</a>
        </Button>
        <Badge variant="secondary">{roleTitle}</Badge>
      </div>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Navigation is role-aware. Use the tabs below to switch between the screens relevant to your
        role and the seeded demo data.
      </p>
    </Panel>
  );
}
