// The FE module src/lib/quote-folio/index.ts is imported as types only; it reads import.meta.env (Vite).
// Vite types PROD/DEV as boolean and the PUBLIC_* vars as string | undefined; this shim must accept both
// (a plain Record<string, string | undefined> rejects `import.meta.env.PROD`, which broke `tsc` since edbca54).
interface ImportMeta {
  readonly env: {
    readonly PROD: boolean;
    readonly DEV: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vite env values are string | undefined | boolean per key
    readonly [key: string]: any;
  };
}
