import type { APIRoute } from 'astro';
import { absoluteUrl, siteUrl } from '../lib/seo';

// Produccion: indexable. El deploy de dev sobrescribe dist/robots.txt con "Disallow: /" despues del build.
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap-index.xml', siteUrl())}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
