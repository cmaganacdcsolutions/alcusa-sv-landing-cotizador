// The FE module src/lib/quote-folio/index.ts is imported as types only; it reads import.meta.env (Vite).
// PROD/DEV are booleans in Vite (explicit members win over the string index signature in an intersection).
interface ImportMeta {
  readonly env: Record<string, string | undefined> & { readonly PROD?: boolean; readonly DEV?: boolean };
}
