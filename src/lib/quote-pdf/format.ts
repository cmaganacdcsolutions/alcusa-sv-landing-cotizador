export function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** dd/mm/aaaa in America/El_Salvador. */
export function formatDateSv(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/El_Salvador',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  return p; // en-GB already gives dd/mm/yyyy
}

export function quoteFileName(folio: string): string {
  return `Cotizacion-${folio}.pdf`;
}
