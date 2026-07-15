import { SetMetadata } from '@nestjs/common';
import type { PdsRole } from './identity-provider.js';

export const Roles = (...roles: PdsRole[]) => SetMetadata('roles', roles);
