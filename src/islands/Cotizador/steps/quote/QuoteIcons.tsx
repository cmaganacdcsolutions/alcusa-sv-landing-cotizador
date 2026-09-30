import type { ReactElement, ReactNode } from 'react';

// Iconos del bloque "Cargar cotizacion" (paths tomados 1:1 de ios-r03 /
// desktop-r03). Hereda stroke de `.qsvg` (1.5, round, fill none).
function Svg({ size, children, className, strokeWidth }: { size: number; children: ReactNode; className?: string; strokeWidth?: number }): ReactElement {
  return (
    <svg
      className={className ? `qsvg ${className}` : 'qsvg'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={strokeWidth ? { strokeWidth } : undefined}
    >
      {children}
    </svg>
  );
}

export const IconQuoteDoc = ({ size = 20 }: { size?: number }): ReactElement => (
  <Svg size={size}>
    <path d="M7 3.5h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
    <path d="M14 3.5v4h4M9 12.5h6M9 16h6" />
  </Svg>
);
export const IconQuoteChevron = ({ up = false }: { up?: boolean }): ReactElement => (
  <Svg size={20}>
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </Svg>
);
export const IconQuoteAlert = ({ size = 18 }: { size?: number }): ReactElement => (
  <Svg size={size} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Svg>
);
export const IconQuoteClock = ({ size = 18 }: { size?: number }): ReactElement => (
  <Svg size={size} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconQuoteSearch = ({ size = 18 }: { size?: number }): ReactElement => (
  <Svg size={size} strokeWidth={2}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);
export const IconQuoteOffline = ({ size = 18 }: { size?: number }): ReactElement => (
  <Svg size={size} strokeWidth={2}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3-2M19 12.5a10 10 0 0 0-5.5-2.9M12 20h.01" />
  </Svg>
);
export const IconQuoteCheckCircle = ({ size = 20 }: { size?: number }): ReactElement => (
  <Svg size={size} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l3 3 5-6" />
  </Svg>
);
export const IconQuoteTriangle = ({ size = 20, strokeWidth }: { size?: number; strokeWidth?: number }): ReactElement => (
  <Svg size={size} strokeWidth={strokeWidth}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Svg>
);
export const IconQuoteRefresh = ({ size = 16 }: { size?: number }): ReactElement => (
  <Svg size={size}>
    <path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5" />
  </Svg>
);
export const IconQuoteSpinner = (): ReactElement => (
  <Svg size={20} className="qsp" strokeWidth={2.5}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Svg>
);
export const IconQuoteImage = ({ size = 20 }: { size?: number }): ReactElement => (
  <Svg size={size}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <circle cx="9" cy="10.5" r="1.6" />
    <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
  </Svg>
);
