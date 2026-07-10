import type { DemoRole } from '@/demo-model.js';
import { roleProfiles } from '@/demo-model.js';
import {
  activeRolesInOrder,
  passiveRolesInOrder,
  roleParticipation,
  roleTitle
} from '@/lib/constants';
import { ParticipationDot, participationTriggerClass } from '@/components/ParticipationIndicator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type UserMenuProps = {
  operatorName: string;
  role: DemoRole;
  onRoleChange: (role: DemoRole) => void;
  onLogout: () => void;
};

const RoleSelectItem = ({ role }: { role: DemoRole }) => {
  const mode = roleParticipation(role);
  return (
    <SelectItem value={role}>
      <span className="flex items-center gap-2">
        <ParticipationDot mode={mode} />
        {roleProfiles[role].title}
      </span>
    </SelectItem>
  );
};

export function UserMenu({ operatorName, role, onRoleChange, onLogout }: UserMenuProps) {
  const currentMode = roleParticipation(role);

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm font-medium sm:block">{operatorName}</span>
      <Label htmlFor="topbar-role" className="sr-only">
        Role
      </Label>
      <Select value={role} onValueChange={(value) => onRoleChange(value as DemoRole)}>
        <SelectTrigger
          id="topbar-role"
          className={cn('h-9 w-[210px]', participationTriggerClass[currentMode])}
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <ParticipationDot mode={currentMode} />
              {roleTitle(role)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Workbench operators</SelectLabel>
            {activeRolesInOrder().map((candidate) => (
              <RoleSelectItem key={candidate} role={candidate} />
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Oversight &amp; policy</SelectLabel>
            {passiveRolesInOrder().map((candidate) => (
              <RoleSelectItem key={candidate} role={candidate} />
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button variant="secondary" size="sm" onClick={onLogout}>
        Log out
      </Button>
    </div>
  );
}
