const DEV_AUTH_TOKEN_STORAGE_KEY = 'pds-dev-auth-token';

export const getStoredDevAuthToken = (): string => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_DEV_AUTH_TOKEN ?? '';
  }
  return window.localStorage.getItem(DEV_AUTH_TOKEN_STORAGE_KEY) ?? import.meta.env.VITE_DEV_AUTH_TOKEN ?? '';
};

export const setStoredDevAuthToken = (token: string): void => {
  window.localStorage.setItem(DEV_AUTH_TOKEN_STORAGE_KEY, token);
};

export const authHeaders = (): HeadersInit => {
  const token = getStoredDevAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
