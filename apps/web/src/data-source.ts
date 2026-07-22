export type DataSourceMode = 'api' | 'mock';

export const getDataSourceMode = (): DataSourceMode => {
  const configured = import.meta.env.VITE_DATA_SOURCE?.toLowerCase();

  if (configured === 'api' || configured === 'mock') {
    return configured;
  }

  return 'api';
};

export const usesMockData = (_apiOnline: boolean): boolean => {
  const mode = getDataSourceMode();

  return mode === 'mock';
};
