import { describe, expect, it } from 'vitest';
import {
  extractAstroIslandUrls,
  extractDynamicImports,
  extractHtmlScriptSrcs,
  extractStaticImports,
} from '../../../scripts/bundle-imports.mjs';

const JS = 'import{a}from"./a.js";import"./side.js";const x=()=>import("./lazy.js");export{x};';

describe('gate de bundle: extractor de imports', () => {
  it('los estaticos (from / import "x") cuentan', () => {
    expect(extractStaticImports(JS).sort()).toEqual(['./a.js', './side.js']);
  });
  it('los dinamicos import("x") NO cuentan como estaticos', () => {
    expect(extractStaticImports(JS)).not.toContain('./lazy.js');
    expect(extractDynamicImports(JS)).toEqual(['./lazy.js']);
  });
  it('script src, modulepreload e islas son entradas de arranque', () => {
    const html =
      '<script type="module" src="/_astro/s.js"></script><link rel="modulepreload" href="/_astro/p.js">' +
      '<link rel="stylesheet" href="/_astro/x.css"><astro-island component-url="/_astro/C.js" renderer-url="/_astro/client.js">';
    expect(extractHtmlScriptSrcs(html)).toEqual(['/_astro/s.js', '/_astro/p.js']);
    expect(extractAstroIslandUrls(html)).toEqual(['/_astro/C.js', '/_astro/client.js']);
  });
});
