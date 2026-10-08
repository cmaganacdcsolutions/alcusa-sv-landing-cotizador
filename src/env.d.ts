/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_WHATSAPP_NUMBER: string;
  readonly PUBLIC_GOOGLE_MAPS_LINK: string;
  readonly PUBLIC_COTIZADOR_MODE: 'mock' | 'wompi';
  readonly PUBLIC_QUOTE_API?: 'mock' | 'http';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Fecha congelada de promos (vite define en astro.config.mjs; "" = usar hoy en SV). */
declare const __PROMOS_TODAY__: string;
