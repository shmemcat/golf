/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCOUNT_API_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_CARDS_HOME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
