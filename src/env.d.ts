/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_WHATSAPP_NUMBER: string;
  readonly PUBLIC_GOOGLE_MAPS_LINK: string;
  readonly PUBLIC_COTIZADOR_MODE: 'mock' | 'wompi';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
