// HTTP edge of the admin: parse, authenticate, CSRF, call services, render. No business rules here.
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ImageError, ingestPromoImage, MAX_UPLOAD_BYTES } from '../promotions/images.ts';
import { PublishError } from '../promotions/publish.ts';
import { type PromoInput, type PromoService } from '../promotions/service.ts';
import { type AuthService, csrfValid, type SessionInfo, sameOrigin } from './auth-service.ts';
import { CSS, editorView, type FormValues, listView, loginView, page, passwordView, shell } from './views.ts';

export const COOKIE = '__Host-alcusa_admin';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'";

export interface AdminRouteDeps {
  base: string;
  auth: AuthService;
  promos: PromoService;
  imagesDir: string;
  imageUrlPrefix: string;
  now?: () => Date;
}

type Body = Record<string, unknown>;
const str = (b: Body, k: string): string => (typeof b[k] === 'string' ? (b[k] as string) : '');
const num = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function registerAdmin(app: FastifyInstance, d: AdminRouteDeps): void {
  void app.register(
    (r, _o, done) => {
      r.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 16 * 1024 }, (_req, body, cb) => {
        cb(null, Object.fromEntries(new URLSearchParams(body as string)));
      });
      void r.register(multipart, { attachFieldsToBody: 'keyValues', limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20 } });

      r.addHook('onRequest', (_req, reply, hookDone) => {
        void reply.header('content-security-policy', CSP).header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow');
        hookDone();
      });

      const send = (reply: FastifyReply, title: string, body: { s: string }, code = 200): FastifyReply =>
        reply.code(code).type('text/html; charset=utf-8').send(page(title, body as never).replaceAll('__BASE__', d.base));
      const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format((d.now ?? (() => new Date()))());
      const setCookie = (reply: FastifyReply, id: string): void => {
        void reply.setCookie(COOKIE, id, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
      };
      const notFound = (reply: FastifyReply): FastifyReply => reply.code(404).type('text/plain').send('Not found');

      /** 404 uniform without a session; redirect to the forced password page while must_change_password. */
      async function guard(req: FastifyRequest, reply: FastifyReply, opts: { allowMustChange?: boolean } = {}): Promise<SessionInfo | null> {
        const info = await d.auth.resolve(req.cookies[COOKIE]);
        if (!info) {
          void reply.redirect(`${d.base}/login`, 303);
          return null;
        }
        if (info.user.mustChangePassword && !opts.allowMustChange) {
          void reply.redirect(`${d.base}/cuenta/clave`, 303);
          return null;
        }
        return info;
      }
      /** POST guard: session + same-origin + CSRF token. Failures are 403 and mutate nothing. */
      async function guardPost(req: FastifyRequest, reply: FastifyReply, opts: { allowMustChange?: boolean } = {}): Promise<SessionInfo | null> {
        const info = await guard(req, reply, opts);
        if (!info) return null;
        const body = (req.body ?? {}) as Body;
        if (!sameOrigin(req.headers, req.headers.host) || !csrfValid(info.session.csrfToken, body['_csrf'])) {
          void reply.code(403).type('text/plain').send('Solicitud rechazada (CSRF).');
          return null;
        }
        return info;
      }

      r.get('/admin.css', (_req, reply) => reply.type('text/css').header('cache-control', 'public, max-age=300').send(CSS));
      r.get('/', (_req, reply) => reply.redirect(`${d.base}/promociones`, 303));

      r.get('/login', (_req, reply) => send(reply, 'Iniciar sesión', loginView(d.base, {})));
      r.post('/login', async (req, reply) => {
        const b = (req.body ?? {}) as Body;
        if (!sameOrigin(req.headers, req.headers.host)) return reply.code(403).type('text/plain').send('Solicitud rechazada.');
        const res = await d.auth.login(str(b, 'username').slice(0, 40), str(b, 'password').slice(0, 200));
        if (res.kind === 'ok') {
          setCookie(reply, res.sessionId);
          return reply.redirect(res.stage === 'active' ? `${d.base}/promociones` : `${d.base}/login/mfa`, 303);
        }
        if (res.kind === 'locked') {
          const mins = Math.max(1, Math.ceil((res.until.getTime() - (d.now ?? (() => new Date()))().getTime()) / 60_000));
          return send(reply, 'Iniciar sesión', loginView(d.base, { locked: `${mins} min` }), 429);
        }
        return send(reply, 'Iniciar sesión', loginView(d.base, { error: 'x', username: str(b, 'username') }), 401);
      });
      // Reserved 2FA routes: uniform 404 while ADMIN_MFA_MODE=off (ADR-014 §3.4).
      r.get('/login/mfa', (_q, reply) => notFound(reply));
      r.get('/cuenta/mfa-enroll', (_q, reply) => notFound(reply));

      r.post('/logout', async (req, reply) => {
        const info = await guardPost(req, reply, { allowMustChange: true });
        if (!info) return reply;
        await d.auth.logout(req.cookies[COOKIE]);
        void reply.clearCookie(COOKIE, { path: '/' });
        return reply.redirect(`${d.base}/login`, 303);
      });

      r.get('/cuenta/clave', async (req, reply) => {
        const info = await guard(req, reply, { allowMustChange: true });
        if (!info) return reply;
        return send(reply, 'Contraseña', shell(d.base, 'cuenta', info.session.csrfToken, passwordView(d.base, info.session.csrfToken, [], info.user.mustChangePassword)));
      });
      r.post('/cuenta/clave', async (req, reply) => {
        const info = await guardPost(req, reply, { allowMustChange: true });
        if (!info) return reply;
        const b = req.body as Body;
        const res = await d.auth.changePassword(info, str(b, 'current'), str(b, 'next'), str(b, 'confirm'));
        if (!res.ok) return send(reply, 'Contraseña', shell(d.base, 'cuenta', info.session.csrfToken, passwordView(d.base, info.session.csrfToken, res.problems, info.user.mustChangePassword)), 422);
        setCookie(reply, res.sessionId);
        return reply.redirect(`${d.base}/promociones`, 303);
      });

      r.get('/promociones', async (req, reply) => {
        const info = await guard(req, reply);
        if (!info) return reply;
        const csrf = info.session.csrfToken;
        return send(reply, 'Promociones', shell(d.base, 'promos', csrf, listView(d.base, csrf, await d.promos.list(), today())));
      });

      const blank: FormValues = { title: '', description: '', price_before: '', price_promo: '', product_slug: 'recta', vidrio: '', starts_on: '', ends_on: '', rules: '', image: '', image_alt: '' };
      const editor = (reply: FastifyReply, info: SessionInfo, id: string | null, v: FormValues, problems: string[], code = 200): FastifyReply =>
        send(reply, id ? 'Editar promoción' : 'Nueva promoción', shell(d.base, 'promos', info.session.csrfToken, editorView(d.base, info.session.csrfToken, id, v, problems)), code);

      r.get('/promociones/nueva', async (req, reply) => {
        const info = await guard(req, reply);
        return info ? editor(reply, info, null, blank, []) : reply;
      });
      r.get<{ Params: { id: string } }>('/promociones/:id/editar', async (req, reply) => {
        const info = await guard(req, reply);
        if (!info) return reply;
        const p = await d.promos.get(req.params.id);
        if (!p) return notFound(reply);
        return editor(reply, info, p.id, {
          title: p.title, description: p.description, price_before: p.price_before === null ? '' : String(p.price_before), price_promo: String(p.price_promo),
          product_slug: p.product_slug, vidrio: p.cotizador_params?.vidrio ?? '', starts_on: p.starts_on, ends_on: p.ends_on, rules: p.rules.join('\n'), image: p.image, image_alt: p.image_alt,
        }, []);
      });

      /** Form -> PromoInput (+ image ingest). Numeric parsing only here; rules live in the service. */
      async function readForm(b: Body): Promise<{ input: PromoInput; values: FormValues; problems: string[] }> {
        const problems: string[] = [];
        let image = str(b, 'image');
        const file = b['file'];
        if (Buffer.isBuffer(file) && file.length > 0) {
          try {
            image = (await ingestPromoImage(file, d.imagesDir, d.imageUrlPrefix)).publicPath;
          } catch (err) {
            problems.push(err instanceof ImageError ? err.message : 'No se pudo procesar la imagen.');
          }
        }
        const values: FormValues = {
          title: str(b, 'title'), description: str(b, 'description'), price_before: str(b, 'price_before'), price_promo: str(b, 'price_promo'),
          product_slug: str(b, 'product_slug'), vidrio: str(b, 'vidrio'), starts_on: str(b, 'starts_on'), ends_on: str(b, 'ends_on'),
          rules: str(b, 'rules'), image, image_alt: str(b, 'image_alt'),
        };
        const pb = num(values.price_before);
        const pp = num(values.price_promo);
        if (pb !== null && Number.isNaN(pb)) problems.push('Precio antes no es un número.');
        if (pp === null || Number.isNaN(pp)) problems.push('El precio de la promoción es obligatorio y numérico.');
        const input: PromoInput = {
          title: values.title, description: values.description, image, image_alt: values.image_alt,
          price_before: pb === null || Number.isNaN(pb) ? null : pb, price_promo: pp ?? Number.NaN, product_slug: values.product_slug,
          vidrio: values.vidrio || null, starts_on: values.starts_on, ends_on: values.ends_on, rules: values.rules.split(/\r?\n/).filter((x) => x.trim()),
        };
        return { input, values, problems };
      }

      const save = async (req: FastifyRequest, reply: FastifyReply, id: string | null): Promise<FastifyReply> => {
        const info = await guardPost(req, reply);
        if (!info) return reply;
        const b = req.body as Body;
        const { input, values, problems } = await readForm(b);
        const publish = str(b, 'intent') === 'publish';
        if (problems.length === 0) {
          try {
            const res = id ? await d.promos.update(info.user.username, id, input, publish) : await d.promos.create(info.user.username, input, publish);
            if (res.ok) return reply.redirect(`${d.base}/promociones`, 303);
            problems.push(...res.problems);
          } catch (err) {
            if (!(err instanceof PublishError)) throw err;
            problems.push(...err.problems);
          }
        }
        return editor(reply, info, id, values, problems, 422);
      };
      r.post('/promociones', (req, reply) => save(req, reply, null));
      r.post<{ Params: { id: string } }>('/promociones/:id', (req, reply) => save(req, reply, req.params.id));

      for (const action of ['publicar', 'despublicar'] as const) {
        r.post<{ Params: { id: string } }>(`/promociones/:id/${action}`, async (req, reply) => {
          const info = await guardPost(req, reply);
          if (!info) return reply;
          const res = await d.promos.setStatus(info.user.username, req.params.id, action === 'publicar');
          if (!res.ok) return send(reply, 'Promociones', shell(d.base, 'promos', info.session.csrfToken, listView(d.base, info.session.csrfToken, await d.promos.list(), today()), res.problems.join(' ')), 422);
          return reply.redirect(`${d.base}/promociones`, 303);
        });
      }
      r.post<{ Params: { id: string } }>('/promociones/:id/eliminar', async (req, reply) => {
        const info = await guardPost(req, reply);
        if (!info) return reply;
        await d.promos.remove(info.user.username, req.params.id);
        return reply.redirect(`${d.base}/promociones`, 303);
      });

      // Preview of uploaded / existing promo images (public images, but only served to a session).
      r.get<{ Params: { file: string } }>('/media/promos/:file', async (req, reply) => {
        if (!(await d.auth.resolve(req.cookies[COOKIE]))) return notFound(reply);
        if (!/^[A-Za-z0-9-]+-(600|900)\.webp$/.test(req.params.file)) return notFound(reply);
        const path = join(d.imagesDir, req.params.file);
        if (!existsSync(path)) return notFound(reply);
        return reply.type('image/webp').header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=300').send(createReadStream(path));
      });
      done();
    },
    { prefix: d.base },
  );
}
