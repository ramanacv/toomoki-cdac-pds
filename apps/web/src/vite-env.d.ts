/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DATA_SOURCE?: 'api' | 'mock' | 'auto';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
