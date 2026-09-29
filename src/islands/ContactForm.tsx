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

      <div className="contact-form__row">
      <div className="contact-form__field">
        <label htmlFor="nombre" className="contact-form__label">
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          autoComplete="name"
          placeholder="Tu nombre"
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
          placeholder="7680-2410"
          className="contact-form__input"
          data-invalid={telError}
          aria-invalid={telError}
          aria-describedby={telError ? telHelpId : undefined}
          value={telefono}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTelefono(e.target.value)}
        />
        {telError && (
          <span id={telHelpId} className="contact-form__error" role="alert">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className="contact-form__error-icon contact-form__error-icon--desktop"
            >
              <path d="M12 4l9 16H3z" />
              <path d="M12 10v4M12 17h.01" />
            </svg>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              className="contact-form__error-icon contact-form__error-icon--mobile"
            >
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5.5M12 16v.2" />
            </svg>
            Ingresa un teléfono de 8 dígitos, por ejemplo 7680-2410.
          </span>
        )}
      </div>
      </div>

      <div className="contact-form__field">
        <label htmlFor="producto" className="contact-form__label">
          Producto de interés
        </label>
        <div className="contact-form__select-wrap">
          <select
            id="producto"
            name="producto"
            className="contact-form__input contact-form__select"
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
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="contact-form__select-chevron">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="contact-form__field">
        <label htmlFor="mensaje" className="contact-form__label">
          Mensaje
        </label>
        <textarea
          id="mensaje"
          name="mensaje"
          rows={3}
          placeholder="Cuéntanos medidas aproximadas, ubicación o cualquier duda."
          className="contact-form__input contact-form__input--textarea"
          value={mensaje}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMensaje(e.target.value)}
        />
      </div>

      {ready ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="contact-form__submit">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="contact-form__submit-icon">
            <path d="M4.5 19.5l1.2-3.6a8 8 0 1 1 2.9 2.6z" />
            <path d="M9.3 8.7c.4 2.6 3.2 5.4 6 6l1.1-1.4-1.8-1-1 .9c-1-.4-2-1.4-2.4-2.4l.9-1-1-1.8z" />
          </svg>
          Enviar por WhatsApp
        </a>
      ) : (
        <div className="contact-form__submit-disabled-wrap">
          <button type="button" disabled className="contact-form__submit contact-form__submit--disabled">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="contact-form__submit-icon">
              <path d="M4.5 19.5l1.2-3.6a8 8 0 1 1 2.9 2.6z" />
              <path d="M9.3 8.7c.4 2.6 3.2 5.4 6 6l1.1-1.4-1.8-1-1 .9c-1-.4-2-1.4-2.4-2.4l.9-1-1-1.8z" />
            </svg>
            Enviar por WhatsApp
          </button>
          <span className="contact-form__submit-helper">Completa tu nombre y teléfono para enviar.</span>
        </div>
      )}

      <p className="contact-form__quote-note">
        ¿Prefieres conocer tu precio primero? <a href="/cotizador">Usa el cotizador</a>
      </p>
    </form>
  );
}
