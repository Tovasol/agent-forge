/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CAL_LINK?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_CF_BEACON_TOKEN?: string;
  readonly VITE_FOUNDER_NAME?: string;
  readonly VITE_FOUNDER_CREDENTIAL?: string;
  readonly VITE_FOUNDER_PHOTO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
