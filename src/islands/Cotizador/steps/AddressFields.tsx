import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { DEPARTAMENTOS, getDepartamento, getMunicipio } from '@content/elSalvadorTerritory';
import {
  validateAddressField,
  mapsUrl,
  type AddressField,
  type DeliveryAddress,
  type GeoPoint,
} from '../../../lib/delivery-address';
import { IconChevronDown, IconWarningCircle } from '../icons';
import '@styles/cotizador-address.css';

// "Entrega y zona" (solo Con instalacion): direccion completa + ubicacion opcional.
// PII: nada de esto se registra en consola ni viaja en URLs.

export const ADDRESS_INPUT_ID: Readonly<Record<AddressField, string>> = {
  departamentoId: 'addr-departamento',
  municipioId: 'addr-municipio',
  distritoId: 'addr-distrito',
  colonia: 'addr-colonia',
  calle: 'addr-calle',
  referencia: 'addr-referencia',
  telefono: 'addr-telefono',
};

type GeoStatus = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable' | 'timeout';

const GEO_MSG: Readonly<Record<'denied' | 'unavailable' | 'timeout', string>> = {
  denied: 'No pudimos usar tu ubicación porque no diste permiso. No pasa nada: continúa con tu dirección escrita.',
  unavailable: 'Tu dispositivo no pudo darnos la ubicación. No pasa nada: continúa con tu dirección escrita.',
  timeout: 'Tardó demasiado en encontrar tu ubicación. Puedes intentarlo de nuevo o continuar con tu dirección escrita.',
};

export interface AddressFieldsProps {
  address: DeliveryAddress;
  /** Muestra los errores de todos los campos (tras pulsar "Siguiente" con datos incompletos). */
  showAllErrors: boolean;
  onChange: (field: AddressField, value: string) => void;
  onGeoChange: (geo: GeoPoint | null) => void;
}

interface MsgProps {
  field: AddressField;
  error: string;
  hint?: string;
}

function Msg({ field, error, hint }: MsgProps): ReactElement {
  return (
    <span
      id={`${ADDRESS_INPUT_ID[field]}-msg`}
      className="field__helper addr__msg"
      data-invalid={error ? 'true' : undefined}
      aria-live="polite"
    >
      {error ? (
        <>
          <IconWarningCircle size={16} />
          {error}
        </>
      ) : (
        (hint ?? '')
      )}
    </span>
  );
}

export default function AddressFields({ address, showAllErrors, onChange, onGeoChange }: AddressFieldsProps): ReactElement {
  const [touched, setTouched] = useState<Partial<Record<AddressField, boolean>>>({});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>(address.geo ? 'ok' : 'idle');
  const rootRef = useRef<HTMLDivElement>(null);

  // Teclado movil: el campo enfocado se mantiene visible mientras el teclado se abre.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onFocusIn = (e: FocusEvent): void => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches('input, select')) return;
      window.setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'auto' }), 300);
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, []);

  const departamento = getDepartamento(address.departamentoId);
  const municipio = getMunicipio(address.departamentoId, address.municipioId);
  const errorOf = (f: AddressField): string => (showAllErrors || touched[f] ? validateAddressField(address, f) : '');
  const touch = (f: AddressField): void => setTouched((p) => (p[f] ? p : { ...p, [f]: true }));

  const requestGeo = (): void => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoStatus('unavailable');
      return;
    }
    setGeoStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onGeoChange({
          lat: Math.round(pos.coords.latitude * 1e5) / 1e5,
          lng: Math.round(pos.coords.longitude * 1e5) / 1e5,
        });
        setGeoStatus('ok');
      },
      (err) =>
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const common = (f: AddressField) => ({
    id: ADDRESS_INPUT_ID[f],
    required: true,
    'aria-required': true as const,
    'aria-invalid': errorOf(f) ? ('true' as const) : undefined,
    'aria-describedby': `${ADDRESS_INPUT_ID[f]}-msg`,
    onBlur: () => touch(f),
  });

  const text = (f: 'colonia' | 'calle' | 'referencia' | 'telefono', autoComplete: string) => ({
    ...common(f),
    className: 'addr__input',
    autoComplete,
    'data-invalid': errorOf(f) ? ('true' as const) : undefined,
    value: address[f],
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(f, e.target.value),
  });

  const label = (f: AddressField, children: string): ReactElement => (
    <label className="field__label addr__label" htmlFor={ADDRESS_INPUT_ID[f]}>
      {children}
    </label>
  );

  return (
    <div ref={rootRef} className="addr" data-testid="address-fields">
      <p className="addr__intro">Escribe la dirección donde instalaremos. Con ella calculamos el envío.</p>

      <div className="field addr__field">
        {label('departamentoId', 'Departamento')}
        <div className="select-field-wrap">
          <select
            {...common('departamentoId')}
            className="select-field addr__select"
            autoComplete="address-level1"
            value={address.departamentoId}
            onChange={(e) => onChange('departamentoId', e.target.value)}
          >
            <option value="">Elige tu departamento</option>
            {DEPARTAMENTOS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <IconChevronDown />
        </div>
        <Msg field="departamentoId" error={errorOf('departamentoId')} />
      </div>

      <div className="field addr__field">
        {label('municipioId', 'Municipio')}
        <div className="select-field-wrap">
          <select
            {...common('municipioId')}
            className="select-field addr__select"
            autoComplete="address-level2"
            value={address.municipioId}
            disabled={!departamento}
            onChange={(e) => onChange('municipioId', e.target.value)}
          >
            <option value="">{departamento ? 'Elige tu municipio' : 'Primero elige el departamento'}</option>
            {departamento?.municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <IconChevronDown />
        </div>
        <Msg field="municipioId" error={errorOf('municipioId')} />
      </div>

      <div className="field addr__field">
        {label('distritoId', 'Distrito')}
        <div className="select-field-wrap">
          <select
            {...common('distritoId')}
            className="select-field addr__select"
            autoComplete="address-level3"
            value={address.distritoId}
            disabled={!municipio}
            onChange={(e) => onChange('distritoId', e.target.value)}
          >
            <option value="">{municipio ? 'Elige tu distrito' : 'Primero elige el municipio'}</option>
            {municipio?.distritos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <IconChevronDown />
        </div>
        <Msg
          field="distritoId"
          error={errorOf('distritoId')}
          hint="Desde 2024, los antiguos municipios son distritos."
        />
      </div>

      <div className="field addr__field">
        {label('colonia', 'Colonia, residencial o barrio')}
        <input {...text('colonia', 'address-line2')} type="text" maxLength={120} placeholder="Ej. Residencial Las Flores" />
        <Msg field="colonia" error={errorOf('colonia')} />
      </div>

      <div className="field addr__field">
        {label('calle', 'Calle, pasaje o avenida y número de casa')}
        <input {...text('calle', 'street-address')} type="text" maxLength={120} placeholder="Ej. Pasaje 3, casa #12" />
        <Msg field="calle" error={errorOf('calle')} />
      </div>

      <div className="field addr__field">
        {label('referencia', 'Punto de referencia')}
        <input {...text('referencia', 'off')} type="text" maxLength={120} placeholder="Ej. frente a la iglesia, portón negro" />
        <Msg field="referencia" error={errorOf('referencia')} hint="Ejemplo: frente a la iglesia, portón negro." />
      </div>

      <div className="field addr__field">
        {label('telefono', 'Teléfono o WhatsApp')}
        <input {...text('telefono', 'tel')} type="tel" inputMode="tel" maxLength={9} placeholder="7123-4567" />
        <Msg field="telefono" error={errorOf('telefono')} hint="8 dígitos. Lo usaremos para coordinar la entrega." />
      </div>

      <div className="addr__geo">
        <p className="addr__geo-why" id="addr-geo-why">
          Opcional: si quieres, comparte tu ubicación para que nuestro equipo llegue más fácil. No reemplaza tu
          dirección.
        </p>
        <button
          type="button"
          className="addr__geo-btn"
          onClick={requestGeo}
          disabled={geoStatus === 'asking'}
          aria-describedby="addr-geo-why"
        >
          {geoStatus === 'asking' ? 'Buscando tu ubicación…' : address.geo ? 'Actualizar mi ubicación' : 'Usar mi ubicación'}
        </button>
        <div className="addr__geo-status" role="status" aria-live="polite" data-testid="geo-status">
          {geoStatus === 'ok' && address.geo && (
            <>
              <span className="addr__geo-ok">Ubicación guardada ✓</span>{' '}
              <a href={mapsUrl(address.geo)} target="_blank" rel="noopener noreferrer" className="addr__geo-link">
                Ver en mapa
              </a>
            </>
          )}
          {(geoStatus === 'denied' || geoStatus === 'unavailable' || geoStatus === 'timeout') && (
            <span className="addr__geo-warn">{GEO_MSG[geoStatus]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
