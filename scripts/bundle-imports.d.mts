export function extractStaticImports(jsSource: string): string[];
export function extractDynamicImports(jsSource: string): string[];
export function extractHtmlScriptSrcs(html: string): string[];
export function extractAstroIslandUrls(html: string): string[];
export function extractViteMapDeps(jsSource: string): string[];
export function budgetForRoute(route: string, hasIslands: boolean): number;
