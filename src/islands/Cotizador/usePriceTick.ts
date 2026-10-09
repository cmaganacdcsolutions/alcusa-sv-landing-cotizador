import { useEffect, useRef, type RefObject } from 'react';

// Motion 02 E6: realce del precio total cuando CAMBIA su valor. No cuenta digitos (un numero intermedio podria leerse
// como precio real): el texto ya es el definitivo; solo se asienta (opacity/translateY) y se traza una linea fina.
// Solo presentacion: el aria-live del nodo no se toca. El atributo data-tick alterna a/b para reiniciar la animacion
// CSS (src/styles/cotizador-motion.css) sin reflow. Con reduce o ?motion=off no se pone nada.
export function usePriceTick(value: string): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const flip = useRef(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    const quiet = !matchMedia('(prefers-reduced-motion: no-preference)').matches || /[?&]motion=off/.test(location.search);
    if (quiet || !ref.current) return;
    flip.current = !flip.current;
    ref.current.dataset.tick = flip.current ? 'a' : 'b';
  }, [value]);
  return ref;
}
