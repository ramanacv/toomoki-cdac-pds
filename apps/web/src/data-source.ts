export type DataSourceMode = 'api' | 'mock' | 'auto';

export const getDataSourceMode = (): DataSourceMode => {
  const configured = import.meta.env.VITE_DATA_SOURCE?.toLowerCase();

  if (configured === 'api' || configured === 'mock' || configured === 'auto') {
    return configured;
  }

  return 'auto';
};

export const usesMockData = (apiOnline: boolean): boolean => {
  const mode = getDataSourceMode();

  if (mode === 'mock') {
    return true;
  }

  if (mode === 'api') {
    return false;
  }

  return !apiOnline;
};
