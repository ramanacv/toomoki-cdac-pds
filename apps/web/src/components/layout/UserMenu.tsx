import type { DemoRole } from '@/demo-model.js';
import { roleProfiles } from '@/demo-model.js';
import { roleOrder } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type UserMenuProps = {
  operatorName: string;
  role: DemoRole;
  onRoleChange: (role: DemoRole) => void;
  onLogout: () => void;
};

export function UserMenu({ operatorName, role, onRoleChange, onLogout }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm font-medium sm:block">{operatorName}</span>
      <Label htmlFor="topbar-role" className="sr-only">
        Role
      </Label>
      <Select value={role} onValueChange={(value) => onRoleChange(value as DemoRole)}>
        <SelectTrigger id="topbar-role" className="h-9 w-[190px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOrder.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {roleProfiles[candidate].title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="secondary" size="sm" onClick={onLogout}>
        Log out
      </Button>
    </div>
  );
}
