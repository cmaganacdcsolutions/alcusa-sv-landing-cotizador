import { describe, expect, it } from 'vitest';
import {
  budgetForRoute,
  extractAstroIslandUrls,
  extractDynamicImports,
  extractHtmlScriptSrcs,
  extractStaticImports,
  extractViteMapDeps,
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
  it('__vite__mapDeps: lista los chunks diferidos de m.f=[...] (con "/" inicial)', () => {
    const real =
      'precio:()=>z(()=>import(`./Step2Precio.jbwxYva4.js`),__vite__mapDeps([9,2,1]))};' +
      'm.f=["_astro/Step1Medidas.8VkP2tV7.js","_astro/react.DB-4Zxce.js","_astro/cotizador-checkout.C0NxMbj7.css"]';
    expect(extractViteMapDeps(real)).toEqual(['/_astro/Step1Medidas.8VkP2tV7.js', '/_astro/react.DB-4Zxce.js']);
    expect(extractStaticImports(real)).toEqual([]);
  });
  it('presupuesto por ruta: /cotizador 120 KiB, islas 90 KiB, estaticas 40 KiB', () => {
    expect(budgetForRoute('cotizador/index.html', true)).toBe(120 * 1024);
    expect(budgetForRoute('contacto/index.html', true)).toBe(90 * 1024);
    expect(budgetForRoute('index.html', false)).toBe(40 * 1024);
  });
});
