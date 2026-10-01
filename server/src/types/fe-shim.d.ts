// The FE module src/lib/quote-folio/index.ts is imported as types only; it reads import.meta.env (Vite).
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
