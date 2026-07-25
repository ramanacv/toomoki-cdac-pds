import { SetMetadata } from '@nestjs/common';
import type { PdsRole } from './identity-provider.js';

export const Roles = (...roles: PdsRole[]) => SetMetadata('roles', roles);

export const OPERATIONAL_ROLES: PdsRole[] = [
  'management', 'department', 'procurement', 'fci', 'godown', 'block-office', 'fps', 'auditor'
];
