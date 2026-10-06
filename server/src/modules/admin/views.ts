// SSR views: tagged-template helper with autoescape (ADR-013), no template engine. No business logic here.
import type { StoredPromo } from './store.ts';
import { GLASSES, PRODUCT_SLUGS } from '../promotions/schema.ts';

class Raw {
  constructor(readonly s: string) {}
}
export const raw = (s: string): Raw => new Raw(s);
const esc = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0] ?? '';
  vals.forEach((v, i) => {
    const part = Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('') : v instanceof Raw ? v.s : esc(v);
    out += part + (strings[i + 1] ?? '');
  });
  return new Raw(out);
}

export const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4f6f8;color:#14212b}
a{color:#0b5cad}.shell{display:flex;min-height:100vh}nav.side{width:220px;background:#10283b;color:#fff;padding:20px 12px;flex:none}
nav.side a,nav.side span{display:block;color:#fff;padding:10px 12px;border-radius:8px;text-decoration:none}nav.side a.on{background:#1d4468}
nav.side span.off{opacity:.5}main{flex:1;padding:24px;max-width:1100px}h1{margin-top:0}
.card{background:#fff;border:1px solid #d9e0e6;border-radius:12px;padding:16px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.thumb{width:100%;aspect-ratio:1/1;object-fit:contain;background:#eef2f5;border-radius:8px}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:13px;background:#e6edf3}.badge.pub{background:#d8f2e0}
label{display:block;font-weight:600;margin:12px 0 4px}input,select,textarea{width:100%;padding:10px;border:1px solid #9fb0bd;border-radius:8px;font:inherit}
button,.btn{display:inline-block;padding:10px 16px;border:0;border-radius:8px;background:#0b5cad;color:#fff;font:inherit;cursor:pointer;text-decoration:none}
button.sec,.btn.sec{background:#e6edf3;color:#14212b}button.danger{background:#b3261e}.err{background:#fde7e5;border:1px solid #e9a8a3;padding:12px;border-radius:8px;margin:12px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}form.inline{display:inline}.login{max-width:380px;margin:12vh auto;padding:0 16px}
@media(max-width:720px){.shell{flex-direction:column}nav.side{width:auto;display:flex;gap:4px;flex-wrap:wrap;padding:8px}main{padding:16px}}`;

export function page(title: string, body: Raw, nonce?: string): string {
  void nonce;
  return html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · ALCUSA Admin</title><link rel="stylesheet" href="__BASE__/admin.css"></head><body>${body}</body></html>`.s;
}

export function shell(base: string, active: 'promos' | 'cuenta', csrf: string, content: Raw, flash?: string): Raw {
  return html`<div class="shell"><nav class="side"><strong>ALCUSA · Panel</strong>
<a href="${base}/promociones" class="${active === 'promos' ? 'on' : ''}">Promociones</a>
<span class="off" aria-disabled="true">Productos · próximamente</span>
<a href="${base}/cuenta/clave" class="${active === 'cuenta' ? 'on' : ''}">Mi cuenta</a>
<form method="post" action="${base}/logout"><input type="hidden" name="_csrf" value="${csrf}"><button class="sec" type="submit">Cerrar sesión</button></form></nav>
<main>${flash ? html`<div class="card" role="status">${flash}</div>` : ''}${content}</main></div>`;
}

export function loginView(base: string, opts: { error?: string; locked?: string; username?: string }): Raw {
  return html`<div class="login card"><h1>Iniciar sesión</h1><p>Panel de administración · ALCUSA</p>
${opts.locked ? html`<div class="err" role="alert"><strong>Demasiados intentos.</strong> Por seguridad, intenta de nuevo en ${opts.locked}.</div>` : ''}
${opts.error ? html`<div class="err" role="alert"><strong>Credenciales inválidas.</strong> Revisa tu usuario y contraseña e inténtalo otra vez.</div>` : ''}
<form method="post" action="${base}/login"><label for="u">Usuario</label><input id="u" name="username" autocomplete="username" required value="${opts.username ?? ''}">
<label for="p">Contraseña</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<p><button type="submit">Continuar</button></p></form><p><small>¿Sin acceso o olvidaste tu contraseña? Pide a soporte que la restablezca.</small></p></div>`;
}

export function passwordView(base: string, csrf: string, problems: string[], forced: boolean): Raw {
  return html`<h1>${forced ? 'Crea tu contraseña' : 'Cambiar contraseña'}</h1>
${forced ? html`<p>La contraseña temporal solo sirve una vez. Elige una propia que solo tú conozcas.</p>` : ''}
${problems.length ? html`<div class="err" role="alert"><ul>${problems.map((p) => html`<li>${p}</li>`)}</ul></div>` : ''}
<form class="card" method="post" action="${base}/cuenta/clave"><input type="hidden" name="_csrf" value="${csrf}">
<label for="c">Contraseña actual</label><input id="c" name="current" type="password" autocomplete="current-password" required>
<label for="n">Nueva contraseña (al menos 14 caracteres)</label><input id="n" name="next" type="password" autocomplete="new-password" required>
<label for="r">Repite la nueva contraseña</label><input id="r" name="confirm" type="password" autocomplete="new-password" required>
<p><button type="submit">Guardar y continuar</button></p></form>`;
}

const money = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
export function promoStatus(p: StoredPromo, today: string): string {
  if (p.status === 'draft') return 'Borrador';
  if (p.ends_on < today) return 'Vencida';
  return p.starts_on > today ? 'Programada' : 'Publicada';
}

export function listView(base: string, csrf: string, promos: StoredPromo[], today: string): Raw {
  return html`<div class="row"><h1 style="flex:1">Promociones</h1><a class="btn" href="${base}/promociones/nueva">Nueva promoción</a></div>
<p>La landing muestra hasta 3 promociones vigentes a la vez.</p>
${promos.length === 0 ? html`<div class="card">Aún no hay promociones. Crea la primera.</div>` : ''}
<div class="grid">${promos.map((p) => html`<article class="card"><img class="thumb" src="${p.image.startsWith('/') ? base + '/media/promos/' + p.image.split('/').pop() : p.image}" alt="${p.image_alt}">
<h2>${p.title}</h2><p><span class="badge ${p.status === 'published' ? 'pub' : ''}">${promoStatus(p, today)}</span></p>
<p>${p.price_before === null ? 'Precio especial' : html`Antes ${money(p.price_before)}`} · Ahora <strong>${money(p.price_promo)}</strong></p>
<p>${p.starts_on} → ${p.ends_on}</p><div class="row"><a class="btn sec" href="${base}/promociones/${p.id}/editar">Editar</a>
<form class="inline" method="post" action="${base}/promociones/${p.id}/${p.status === 'published' ? 'despublicar' : 'publicar'}"><input type="hidden" name="_csrf" value="${csrf}"><button class="sec">${p.status === 'published' ? 'Despublicar' : 'Publicar'}</button></form>
<details><summary>Eliminar</summary><form class="inline" method="post" action="${base}/promociones/${p.id}/eliminar"><input type="hidden" name="_csrf" value="${csrf}"><button class="danger">Confirmar eliminación</button></form></details></div></article>`)}</div>`;
}

export interface FormValues {
  title: string; description: string; price_before: string; price_promo: string; product_slug: string; vidrio: string;
  starts_on: string; ends_on: string; rules: string; image: string; image_alt: string;
}

export function editorView(base: string, csrf: string, id: string | null, v: FormValues, problems: string[]): Raw {
  const action = id ? `${base}/promociones/${id}` : `${base}/promociones`;
  return html`<h1>${id ? 'Editar promoción' : 'Nueva promoción'}</h1>
${problems.length ? html`<div class="err" role="alert"><strong>Revisa estos campos antes de continuar</strong><ul>${problems.map((p) => html`<li>${p}</li>`)}</ul></div>` : ''}
<form class="card" method="post" action="${action}" enctype="multipart/form-data"><input type="hidden" name="_csrf" value="${csrf}"><input type="hidden" name="image" value="${v.image}">
<label for="t">Título</label><input id="t" name="title" maxlength="80" required value="${v.title}">
<label for="d">Descripción</label><textarea id="d" name="description" maxlength="300" rows="3" required>${v.description}</textarea>
<label for="s">Producto vinculado</label><select id="s" name="product_slug">${PRODUCT_SLUGS.map((s) => html`<option value="${s}" ${s === v.product_slug ? raw('selected') : ''}>${s}</option>`)}</select>
<label for="g">Vidrio preseleccionado en el cotizador (opcional)</label><select id="g" name="vidrio"><option value="">Ninguno</option>${GLASSES.map((g) => html`<option value="${g}" ${g === v.vidrio ? raw('selected') : ''}>${g}</option>`)}</select>
<label for="pb">Precio antes (opcional)</label><input id="pb" name="price_before" inputmode="decimal" value="${v.price_before}">
<label for="pp">Precio de la promoción</label><input id="pp" name="price_promo" inputmode="decimal" required value="${v.price_promo}">
<label for="f">Imagen (JPG, PNG o WebP, hasta 5 MB; se convierte a WebP; cualquier proporción)</label>${v.image ? html`<p><small>Actual: ${v.image}</small></p>` : ''}<input id="f" name="file" type="file" accept="image/jpeg,image/png,image/webp">
<label for="a">Texto alternativo de la imagen</label><textarea id="a" name="image_alt" rows="2" required>${v.image_alt}</textarea>
<label for="si">Vigente desde</label><input id="si" name="starts_on" type="date" required value="${v.starts_on}">
<label for="ei">Vigente hasta</label><input id="ei" name="ends_on" type="date" required value="${v.ends_on}">
<label for="r">Reglas informativas (una por línea, máx. 6)</label><textarea id="r" name="rules" rows="5">${v.rules}</textarea>
<p class="row"><button type="submit" name="intent" value="draft" class="sec">Guardar borrador</button><button type="submit" name="intent" value="publish">Guardar y publicar</button><a class="btn sec" href="${base}/promociones">Cancelar</a></p></form>`;
}
