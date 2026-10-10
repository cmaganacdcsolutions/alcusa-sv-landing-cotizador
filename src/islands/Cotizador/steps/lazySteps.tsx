import { Component, createElement, Fragment, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';

// Los pasos posteriores al selector se cargan aparte (JS de arranque de /cotizador, gate de bundle).
// Se precargan en idle justo despues de hidratar (import() en runtime, no modulepreload del HTML),
// asi que al llegar el usuario normalmente ya estan en cache. Si aun no llegaron, Suspense reserva altura.

// Un chunk que falla (red) se reintenta una vez antes de rendirse. Ojo: los navegadores (WebKit incluso
// tras recargar la pagina) cachean el import() fallido de una URL, y React.lazy cachea el rechazo. Asi que
// los reintentos importan el chunk con un query de cache-bust (misma pieza, URL distinta; sus dependencias
// siguen siendo las mismas URLs) y "Reintentar" recrea el lazy() y remonta el paso. Sin query nuevo el
// reintento "con red de vuelta" fallaria igual.
type StepModule = { default?: unknown } & Record<string, unknown>;
type Loader<P> = () => Promise<{ default: ComponentType<P> }>;
const failedResets: Array<() => void> = [];

/** URL del chunk `<name>.<hash>.js`, leida del propio chunk del cotizador (ya en cache). null en dev/sin match. */
async function resolveChunkUrl(name: string): Promise<string | null> {
  const self = import.meta.url;
  const text = await (await fetch(self)).text();
  const match = new RegExp(`${name}\\.[\\w-]+\\.js`).exec(text);
  return match ? new URL(match[0], self).href : null;
}

async function loadBusted<P>(name: string, load: Loader<P>): Promise<{ default: ComponentType<P> }> {
  const url = await resolveChunkUrl(name).catch(() => null);
  if (!url) return load();
  const mod = (await import(/* @vite-ignore */ `${url}?retry=${Date.now()}`)) as StepModule;
  const component = mod.default ?? Object.values(mod).find((v) => typeof v === 'function');
  return { default: component as ComponentType<P> };
}

function lazyStep<P extends object>(name: string, load: Loader<P>): ComponentType<P> {
  let bust = false;
  const make = (): ComponentType<P> =>
    lazy(() => {
      const first = bust ? loadBusted(name, load) : load();
      return first.catch(() =>
        new Promise<void>((r) => setTimeout(r, 400))
          .then(() => loadBusted(name, load))
          .catch((err: unknown) => {
            bust = true;
            throw err;
          }),
      );
    });
  let Inner = make();
  failedResets.push(() => {
    if (bust) Inner = make();
  });
  return function LazyStepComponent(props: P): ReactNode {
    return createElement(Inner, props);
  };
}

const loaders = {
  medidas: () => import('./Step1Medidas'),
  precio: () => import('./Step2Precio'),
  zona: () => import('./Step3ZonaEntrega'),
  resumen: () => import('./Step4Resumen'),
  pago: () => import('./Step5FormaPago'),
  wompi: () => import('./Step6Wompi'),
  resultado: () => import('./Step7Resultado'),
};

export const Step1Medidas = lazyStep('Step1Medidas', loaders.medidas);
export const Step2Precio = lazyStep('Step2Precio', loaders.precio);
export const Step3ZonaEntrega = lazyStep('Step3ZonaEntrega', loaders.zona);
export const Step4Resumen = lazyStep('Step4Resumen', loaders.resumen);
export const Step5FormaPago = lazyStep('Step5FormaPago', loaders.pago);
export const Step6Wompi = lazyStep('Step6Wompi', loaders.wompi);
export const Step7Resultado = lazyStep('Step7Resultado', loaders.resultado);

/** Precarga (sin bloquear) los pasos posteriores; los errores se ignoran (se reintenta al renderizar). */
function preloadLaterSteps(): void {
  for (const load of Object.values(loaders)) void load().catch(() => undefined);
}

export function usePreloadLaterSteps(): void {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(preloadLaterSteps);
    else setTimeout(preloadLaterSteps, 200);
  }, []);
}

class StepBoundary extends Component<{ children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    // `key` por intento: al reintentar se remonta el hijo y lee el lazy() recreado.
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <div role="alert" className="cotizador__step-error" data-testid="step-load-error">
        <p>No pudimos cargar este paso. Revisa tu conexión; tu cotización sigue guardada.</p>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="step-load-retry"
          onClick={() => {
            for (const reset of failedResets) reset();
            this.setState((st) => ({ failed: false, attempt: st.attempt + 1 }));
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}

/** Suspense con reserva de altura (sin salto de layout) + boundary de error de red. */
export function LazyStep({ children }: { children: ReactNode }): ReactNode {
  return (
    <StepBoundary>
      <Suspense fallback={<div aria-busy="true" data-testid="step-loading" style={{ minHeight: '60vh' }} />}>{children}</Suspense>
    </StepBoundary>
  );
}
