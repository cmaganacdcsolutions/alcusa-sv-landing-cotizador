import { Component, createElement, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';

// Los pasos posteriores al selector se cargan aparte (JS de arranque de /cotizador, gate de bundle).
// Se precargan en idle justo despues de hidratar (import() en runtime, no modulepreload del HTML),
// asi que al llegar el usuario normalmente ya estan en cache. Si aun no llegaron, Suspense reserva altura.

// Un chunk que falla (red) se reintenta una vez antes de rendirse. React.lazy cachea el rechazo,
// asi que cada paso es un wrapper estable sobre un lazy() que se recrea ("reset") al pulsar Reintentar.
const failedResets: Array<() => void> = [];

function lazyStep<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): ComponentType<P> {
  let failed = false;
  const make = (): ComponentType<P> =>
    lazy(() =>
      load().catch(() =>
        new Promise<void>((r) => setTimeout(r, 400))
          .then(load)
          .catch((err: unknown) => {
            failed = true;
            throw err;
          }),
      ),
    );
  let Inner = make();
  failedResets.push(() => {
    if (failed) {
      failed = false;
      Inner = make();
    }
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

export const Step1Medidas = lazyStep(loaders.medidas);
export const Step2Precio = lazyStep(loaders.precio);
export const Step3ZonaEntrega = lazyStep(loaders.zona);
export const Step4Resumen = lazyStep(loaders.resumen);
export const Step5FormaPago = lazyStep(loaders.pago);
export const Step6Wompi = lazyStep(loaders.wompi);
export const Step7Resultado = lazyStep(loaders.resultado);

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

class StepBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="cotizador__step-error" data-testid="step-load-error">
        <p>No pudimos cargar este paso. Revisa tu conexión; tu cotización sigue guardada.</p>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="step-load-retry"
          onClick={() => {
            for (const reset of failedResets) reset();
            this.setState({ failed: false });
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
