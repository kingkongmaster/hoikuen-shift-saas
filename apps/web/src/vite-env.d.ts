/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELEASE_CHANNEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
