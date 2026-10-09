// Motion 02 · E1 revelado escalonado (spec motion-02-cinematic-proposal §3). Un solo IntersectionObserver,
// 0 listeners de scroll/pointermove. Sin JS, con prefers-reduced-motion: reduce o con ?motion=off no se oculta nada.
const root = document.documentElement;

function allowed(): boolean {
  if (root.hasAttribute('data-motion-off')) return false;
  return 'IntersectionObserver' in window && matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

if (allowed()) {
  const items = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  // Lo que ya se ve al cargar (intro, primeras tarjetas) entra sin animar: ni LCP ni CLS cambian.
  const below = items.filter((el) => {
    const r = el.getBoundingClientRect();
    const visible = r.top < window.innerHeight && r.bottom > 0;
    if (visible) el.classList.add('in');
    return !visible;
  });
  root.setAttribute('data-motion', '');
  const io = new IntersectionObserver(
    (entries) => {
      let n = 0;
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        el.style.setProperty('--rv-i', String(Math.min(n++, 5))); // tope 5 pasos = 350 ms: nunca espera por scroll
        el.classList.add('in', 'rv');
        io.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  below.forEach((el) => io.observe(el));
}
