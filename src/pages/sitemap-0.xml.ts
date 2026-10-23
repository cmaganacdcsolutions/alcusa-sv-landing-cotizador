import type { APIRoute } from 'astro';
import { INDEXABLE_PATHS, absoluteUrl, canonicalPath, siteUrl } from '../lib/seo';

export const GET: APIRoute = () => {
  const base = siteUrl();
  const urls = INDEXABLE_PATHS.map((p) => `<url><loc>${absoluteUrl(canonicalPath(p), base)}</loc></url>`).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
