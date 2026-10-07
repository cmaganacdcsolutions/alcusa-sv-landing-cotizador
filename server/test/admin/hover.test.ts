import { describe, expect, it } from 'vitest';
import { CSS } from '../../src/modules/admin/views.ts';

// Pure string checks on the served stylesheet: no app, no DB, no network. The admin CSP is style-src 'self', so every
// hover rule must live in /admin.css and be gated behind a real-hover pointer.

const HOVER_MQ = '@media(hover:hover) and (pointer:fine){';
const REDUCED_MQ = '@media(prefers-reduced-motion:reduce){';

/** Returns the body of the first at-rule that starts with `head` (balanced braces), or null. */
function atRuleBody(css: string, head: string): string | null {
  const start = css.indexOf(head);
  if (start < 0) return null;
  let depth = 1;
  for (let i = start + head.length; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + head.length, i);
  }
  return null;
}

const hoverBlock = atRuleBody(CSS, HOVER_MQ) ?? '';
const outsideHover = CSS.replace(HOVER_MQ + hoverBlock + '}', '');

describe('admin stylesheet: button hover (soft fill, same family as the public navbar)', () => {
  it('declares the shared hover tokens in :root as well-formed, separate declarations', () => {
    const root = /^:root{([^}]*)}/.exec(CSS)?.[1] ?? '';
    const tokens = new Map(root.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1).trim()] as const));
    // A missing ';' would swallow the next token into the previous value and silently disable it in the browser.
    for (const [name, value] of tokens) expect(value, name).not.toMatch(/--[a-z0-9-]+:/);
    expect(tokens.get('--hover-dur')).toBe('160ms');
    expect(tokens.get('--hover-ease')).toBe('cubic-bezier(.2,.8,.2,1)');
    expect(tokens.get('--active-dur')).toBe('80ms');
    expect(tokens.get('--card-ring')).toBe('0 0 0 2px #a9d3f7');
  });

  it('applies the background-color hover to buttons, button-like links and nav items inside (hover:hover) and (pointer:fine)', () => {
    expect(hoverBlock).not.toBe('');
    expect(hoverBlock).toContain('button:not([disabled]):hover');
    expect(hoverBlock).toContain('.btn:hover');
    expect(hoverBlock).toContain('nav.side a:hover');
    expect(hoverBlock).toContain('background-color:var(--b-hover)');
  });

  it('keeps every button/link/card hover rule inside the media query (nothing leaks to touch devices)', () => {
    const leaked = outsideHover.match(/[^{}]*:hover[^{}]*\{/g) ?? [];
    // Form fields keep their own border hover; buttons, links, cards and summaries must not appear here.
    expect(leaked.filter((sel) => !/^\s*input:hover,select:hover,textarea:hover/.test(sel))).toEqual([]);
  });

  it('does not lift or add a drop shadow to buttons on hover; cards only get a ring', () => {
    expect(hoverBlock).not.toContain('translateY');
    expect(hoverBlock).not.toContain('transform');
    const rules = hoverBlock.match(/[^{}]+\{[^}]*\}/g) ?? [];
    const withShadow = rules.filter((r) => r.includes('box-shadow'));
    expect(withShadow).toHaveLength(1);
    expect(withShadow[0]).toContain('.grid .card:hover');
    expect(withShadow[0]).toContain('var(--card-ring)');
  });

  it('transitions only color properties (background-color, color, border-color) on buttons', () => {
    const rule = CSS.match(/button,\.btn,nav\.side a,details summary\{transition:([^}]*)\}/);
    expect(rule).not.toBeNull();
    const props = (rule?.[1] ?? '').split(',').map((t) => t.trim().split(' ')[0]);
    expect(props).toEqual(['background-color', 'color', 'border-color']);
  });

  it('gives every variant its own hover/active shades (primary, secondary, ghost on navy, danger)', () => {
    expect(CSS).toMatch(/button,\.btn\{--b:var\(--brand\);--b-hover:var\(--brand-hover\);--b-active:var\(--brand-active\)/);
    expect(CSS).toContain('button.sec,.btn.sec{--b:#e3e9f0;--b-hover:#d3dce6;');
    expect(CSS).toContain('nav.side button.sec,main>nav .btn.sec{--b:rgba(255,255,255,.1);--b-hover:rgba(255,255,255,.18);');
    expect(CSS).toContain('nav.side a{--b:transparent;--b-hover:var(--ghost-hover)');
    expect(CSS).toContain('button.danger{--b:var(--danger);--b-hover:#951d17;');
    expect(CSS).toContain('main>.row>.btn:not(.sec),main>nav .btn:not(.sec){--b-hover:var(--brand-lift)');
  });

  it('applies a deeper :active shade after the hover block, so it wins while pressed, and skips disabled buttons', () => {
    const active = 'button:not([disabled]):active,.btn:active,nav.side a:active{background-color:var(--b-active);transition-duration:var(--active-dur)}';
    expect(CSS).toContain(active);
    expect(CSS.indexOf(active)).toBeGreaterThan(CSS.indexOf(HOVER_MQ));
    expect(CSS).toContain('button[disabled]{opacity:.7;cursor:progress}');
  });

  it('leaves the :focus-visible ring untouched', () => {
    expect(CSS).toContain(':focus-visible{outline:none;box-shadow:var(--ring);border-radius:8px}');
  });

  it('removes all transitions under prefers-reduced-motion (colors still change, instantly)', () => {
    const reduced = atRuleBody(CSS, REDUCED_MQ);
    expect(reduced).not.toBeNull();
    expect(reduced).toContain('transition:none!important');
    expect(reduced).toContain('animation:none!important');
  });

  it('serves everything from the stylesheet (CSP style-src self: no inline style hooks)', () => {
    expect(CSS).not.toMatch(/style\s*=/);
  });
});
