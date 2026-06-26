import { SetMetadata } from '@nestjs/common';

/**
 * Classifies a controller or route handler as belonging to the control plane
 * (policy, identity, rules, lifecycle governance) or the data plane
 * (commodity flows, distributions, grievances, audit events).
 *
 * The PdsLoggingInterceptor and MetricsService read this metadata so that
 * every log line and every metric carries a `plane` label, enabling
 * independent alerting thresholds for governance vs operational traffic.
 */
export type PlaneType = 'control' | 'data';

export const PLANE_KEY = 'pds.plane';

export const Plane = (plane: PlaneType) => SetMetadata(PLANE_KEY, plane);
