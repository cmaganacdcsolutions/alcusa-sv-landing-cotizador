import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// ALCUSA landing + cotizador — static output, React islands only for the
// cotizador wizard and contact form. See docs/architecture/adr/adr-001.
export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'https://alcusasv.com',
  integrations: [react()],
  vite: {
    resolve: {
      alias: {
        '@components': '/src/components',
        '@islands': '/src/islands',
        '@engine': '/src/engine',
        '@integrations': '/src/integrations',
        '@content': '/src/content',
        '@styles': '/src/styles',
        '@layouts': '/src/layouts',
      },
    },
  },
});
