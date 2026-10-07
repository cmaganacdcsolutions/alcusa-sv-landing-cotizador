// SSR views: tagged-template helper with autoescape (ADR-013), no template engine. No business logic here.
import type { StoredPromo } from './store.ts';
import { COLORS, GLASSES, PRODUCT_SLUGS } from '../promotions/schema.ts';

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

export { CSS, JS } from './theme.ts';

export function page(title: string, body: Raw, nonce?: string): string {
  void nonce;
  return html`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title} · ALCUSA Admin</title><meta name="theme-color" content="#0f1c2b"><link rel="icon" href="__BASE__/admin-assets/mark.webp" type="image/webp"><link rel="stylesheet" href="__BASE__/admin.css"></head><body>${body}<script src="__BASE__/admin.js" defer></script></body></html>`.s;
}

export function shell(base: string, active: 'promos' | 'cuenta', csrf: string, content: Raw, flash?: string): Raw {
  return html`<div class="shell"><nav class="side"><div class="brand"><img src="${base}/admin-assets/mark.webp" alt="" width="36" height="36"><div>ALCUSA<small>Panel de administración</small></div></div>
<a href="${base}/promociones" class="${active === 'promos' ? 'on' : ''}">Promociones</a>
<span class="off" aria-disabled="true">Productos · próximamente</span>
<a href="${base}/cuenta/clave" class="${active === 'cuenta' ? 'on' : ''}">Mi cuenta</a>
<form method="post" action="${base}/logout"><input type="hidden" name="_csrf" value="${csrf}"><button class="sec" type="submit">Cerrar sesión</button></form></nav>
<main>${flash ? html`<div class="card toast" role="status">${flash}</div>` : ''}${content}</main></div>`;
}

export function loginView(base: string, opts: { error?: string; locked?: string; username?: string }): Raw {
  return html`<main class="auth"><div class="auth-box">
<div class="auth-brand"><img src="${base}/admin-assets/mark.webp" alt="" width="56" height="56"><div><b>ALCUSA</b><span>Disfrutar con calidad</span></div></div>
<h1>Iniciar sesión</h1><p class="lead">Panel de administración · ALCUSA</p>
<div class="card">
${opts.locked ? html`<div class="err" role="alert"><strong>Demasiados intentos.</strong> Por seguridad, intenta de nuevo en ${opts.locked}.</div>` : ''}
${opts.error ? html`<div class="err" role="alert"><strong>Credenciales inválidas.</strong> Revisa tu usuario y contraseña e inténtalo otra vez.</div>` : ''}
<form method="post" action="${base}/login" data-login><label for="u">Usuario</label><input id="u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${opts.username ?? ''}">
<label for="p">Contraseña</label><div class="pw"><input id="p" name="password" type="password" autocomplete="current-password" required><button type="button" class="sec" data-toggle aria-controls="p" aria-pressed="false" hidden>Mostrar</button></div>
<button type="submit">Continuar</button></form></div>
<p class="auth-foot">¿Sin acceso o olvidaste tu contraseña? Pide a soporte que la restablezca.</p></div></main>`;
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
  if (p.status === 'archived') return 'Archivada';
  if (p.status === 'draft') return 'Borrador';
  if (p.ends_on < today) return 'Vencida';
  return p.starts_on > today ? 'Programada' : 'Publicada';
}

const badgeClass = (p: StoredPromo, today: string): string =>
  ({ Archivada: 'arch', Borrador: 'draft', Vencida: 'exp', Programada: 'sched', Publicada: 'pub' })[promoStatus(p, today)] ?? '';

export type ListFilter = 'activas' | 'archivadas';

export function listView(base: string, csrf: string, all: StoredPromo[], today: string, filter: ListFilter = 'activas'): Raw {
  const archivedView = filter === 'archivadas';
  const promos = all.filter((p) => (p.status === 'archived') === archivedView);
  const post = (id: string, action: string, label: string, cls = 'sec'): Raw =>
    html`<form class="inline" method="post" action="${base}/promociones/${id}/${action}"><input type="hidden" name="_csrf" value="${csrf}"><button class="${cls}">${label}</button></form>`;
  return html`<div class="row head"><h1>Promociones</h1><a class="btn" href="${base}/promociones/nueva">Nueva promoción</a></div>
<p>La landing muestra hasta 3 promociones vigentes a la vez.</p>
<nav class="row" aria-label="Filtro"><a class="btn ${archivedView ? 'sec' : ''}" href="${base}/promociones" ${archivedView ? '' : raw('aria-current="page"')}>Activas</a>
<a class="btn ${archivedView ? '' : 'sec'}" href="${base}/promociones?estado=archivadas" ${archivedView ? raw('aria-current="page"') : ''}>Archivadas</a></nav>
${promos.length === 0 ? html`<div class="card empty"><strong>${archivedView ? 'No hay promociones archivadas.' : 'Aún no hay promociones.'}</strong>${archivedView ? 'Lo que archives aparecerá aquí.' : 'Crea la primera con el botón «Nueva promoción».'}</div>` : ''}
<div class="grid">${promos.map((p) => html`<article class="card"><img class="thumb" src="${p.image.startsWith('/') ? base + '/media/promos/' + p.image.split('/').pop() : p.image}" alt="${p.image_alt}">
<h2>${p.title}</h2><p><span class="badge ${badgeClass(p, today)}">${promoStatus(p, today)}</span></p>
<p>${p.price_before === null ? 'Precio especial' : html`Antes ${money(p.price_before)}`} · Ahora <strong>${money(p.price_promo)}</strong></p>
<p>${p.starts_on} → ${p.ends_on}</p><div class="row">${p.status === 'archived'
  ? html`${post(p.id, 'reactivar', 'Reactivar')}<small>Vuelve como borrador.</small>`
  : html`<a class="btn sec" href="${base}/promociones/${p.id}/editar">Editar</a>${post(p.id, p.status === 'published' ? 'despublicar' : 'publicar', p.status === 'published' ? 'Despublicar' : 'Publicar')}
<details><summary>Archivar</summary><small>Sale de la landing. Podrás reactivarla desde Archivadas.</small>${post(p.id, 'archivar', 'Confirmar archivado', 'danger')}</details>`}</div></article>`)}</div>`;
}

export interface FormValues {
  title: string; description: string; price_before: string; price_promo: string; product_slug: string; color: string; vidrio: string;
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
<label for="c">Color de aluminio preseleccionado en el cotizador (opcional)</label><select id="c" name="color"><option value="">Ninguno</option>${COLORS.map((c) => html`<option value="${c}" ${c === v.color ? raw('selected') : ''}>${c}</option>`)}</select>
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
