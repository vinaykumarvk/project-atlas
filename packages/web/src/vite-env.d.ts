/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_DEMO_MODE?: string;
  VITE_DEBUG?: string;
  VITE_AI_ASSIST?: string;
  VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
