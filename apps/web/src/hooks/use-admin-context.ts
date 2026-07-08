import { useOutletContext } from 'react-router-dom';
import type { Stakeholder } from '@pds/shared-types';
import type { AdminOverview } from '@/admin-api.js';

export type AdminOutletContext = {
  overview: AdminOverview | null;
  stakeholders: Stakeholder[];
  apiOnline: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useAdminContext = () => useOutletContext<AdminOutletContext>();
