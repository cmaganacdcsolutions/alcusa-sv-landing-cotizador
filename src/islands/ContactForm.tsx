import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildContactMessage, isContactFormReady, isTelefonoError } from '@integrations/whatsapp/contactMessage';
import './ContactForm.css';

// 6 catalog categories + "Otro" per §2.9. Kept as a literal list (not
// imported from @content/catalog) because the webform's labels are the
// long-form names shown on the approved board's <select>, independent of
// the cotizador's internal ProductId slugs.
const PRODUCTO_OPTIONS = [
  'Puerta de baño recta',
  'Cabina en L',
  'Templado 10 mm',
  'Puerta con bisagra',
  'Puerta de jardín',
  'Ventana Francesa o Bilbao',
  'Otro',
] as const;

// Contact webform island (T9.2), hydrated `client:visible` inside
// Contacto.astro. No backend: the only action is opening a wa.me deep link
// built from src/integrations/whatsapp. Ported 1:1 from the approved board
// (ios-08-contacto-webform.dc.html).
export default function ContactForm(): ReactElement {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [producto, setProducto] = useState('');
  const [mensaje, setMensaje] = useState('');

  const telHelpId = useId();
  // client:visible hydrates asynchronously (after the island intersects the
  // viewport). Flips a plain DOM attribute (not React state — no UI role,
  // test-only) once mounted, so e2e specs can wait for React to be
  // interactive before filling fields instead of racing the pre-hydration
  // static HTML.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.setAttribute('data-hydrated', 'true');
  }, []);

  const telError = isTelefonoError(telefono);
  const ready = isContactFormReady(nombre, telefono);
  const waHref = buildWaLink(buildContactMessage({ nombre, telefono, producto, mensaje }));

  return (
    <form
      ref={formRef}
      aria-labelledby="contacto-form-title"
      className="contact-form"
      data-testid="contact-form-root"
      data-hydrated="false"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="contact-form__intro">
        <h3 id="contacto-form-title" className="contact-form__title">
          Escríbenos
        </h3>
        <p className="contact-form__subtitle">Tu mensaje se abre listo en WhatsApp.</p>
      </div>

      <div className="contact-form__field">
        <label htmlFor="nombre" className="contact-form__label">
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          autoComplete="name"
          className="contact-form__input"
          value={nombre}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNombre(e.target.value)}
        />
      </div>

      <div className="contact-form__field">
        <label htmlFor="telefono" className="contact-form__label">
          Teléfono
        </label>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="contact-form__input"
          data-invalid={telError}
          aria-invalid={telError}
          aria-describedby={telError ? telHelpId : undefined}
          value={telefono}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTelefono(e.target.value)}
        />
        {telError && (
          <span id={telHelpId} className="contact-form__error" role="alert">
            Ingresa un teléfono de 8 dígitos, por ejemplo 7680-2410.
          </span>
        )}
      </div>

      <div className="contact-form__field">
        <label htmlFor="producto" className="contact-form__label">
          Producto de interés
        </label>
        <select
          id="producto"
          name="producto"
          className="contact-form__input"
          value={producto}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setProducto(e.target.value)}
        >
          <option value="">Selecciona una opción</option>
          {PRODUCTO_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="contact-form__field">
        <label htmlFor="mensaje" className="contact-form__label">
          Mensaje
        </label>
        <textarea
          id="mensaje"
          name="mensaje"
          rows={3}
          className="contact-form__input contact-form__input--textarea"
          value={mensaje}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMensaje(e.target.value)}
        />
      </div>

      {ready ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="contact-form__submit">
          Enviar por WhatsApp
        </a>
      ) : (
        <div className="contact-form__submit-disabled-wrap">
          <button type="button" disabled className="contact-form__submit contact-form__submit--disabled">
            Enviar por WhatsApp
          </button>
          <span className="contact-form__submit-helper">Completa tu nombre y teléfono para enviar.</span>
        </div>
      )}
    </form>
  );
}
