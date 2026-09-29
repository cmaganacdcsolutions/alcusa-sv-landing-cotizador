import type { Page } from '@playwright/test';

// qa-cot-resp — shared in-browser audit run at every checkpoint of the
// responsive sweep (tests/responsive/cotizador-sweep.spec.ts). Pure
// read-only DOM inspection: never clicks/mutates, only measures. Runs
// entirely inside page.evaluate (no outer-scope closures) because it has to
// execute in the browser context.

export interface Violation {
  type:
    | 'page-overflow'
    | 'fixed-overflow'
    | 'element-overflow'
    | 'clipped-text'
    | 'sibling-overlap'
    | 'form-aside-overlap'
    | 'bottom-bar-overlap'
    | 'broken-image'
    | 'missing-model-image';
  selector: string;
  detail: string;
}

export async function runAudit(page: Page, checkModelImages: boolean): Promise<Violation[]> {
  return page.evaluate((checkModelImages: boolean) => {
    // sf-cot-resp typecheck fix — `type` must be the same literal union as
    // Violation['type'], not `string`, or every push() below widens the
    // array's inferred element type and the function's declared
    // Promise<Violation[]> return type no longer matches (tsc error).
    const viol: {
      type:
        | 'page-overflow'
        | 'fixed-overflow'
        | 'element-overflow'
        | 'clipped-text'
        | 'sibling-overlap'
        | 'form-aside-overlap'
        | 'bottom-bar-overlap'
        | 'broken-image'
        | 'missing-model-image';
      selector: string;
      detail: string;
    }[] = [];
    const TOLERANCE = 2; // px, absorbs sub-pixel rounding from CSS grid/flex math

    function cssPath(el: Element): string {
      const parts: string[] = [];
      let node: Element | null = el;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 6) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += `#${node.id}`;
          parts.unshift(part);
          break;
        }
        const cls = (node.getAttribute('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.');
        if (cls) part += `.${cls}`;
        parts.unshift(part);
        node = node.parentElement;
        depth++;
      }
      return parts.join(' > ');
    }

    function isVisible(el: Element): boolean {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    const vw = document.documentElement.clientWidth;

    // 1. page-level horizontal scroll
    const sw = document.documentElement.scrollWidth;
    if (sw > vw + TOLERANCE) {
      viol.push({ type: 'page-overflow', selector: 'html', detail: `scrollWidth ${sw}px > innerWidth ${vw}px` });
    }

    function isIntentionalScroller(el: Element): boolean {
      const cs = getComputedStyle(el);
      return cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    }

    // 2. element right-edge past the viewport (or a fixed element past it),
    // unless nested inside a deliberate horizontal scroller.
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    for (const el of all) {
      if (!isVisible(el)) continue;
      let p: HTMLElement | null = el.parentElement;
      let inScroller = false;
      while (p) {
        if (isIntentionalScroller(p)) {
          inScroller = true;
          break;
        }
        p = p.parentElement;
      }
      if (inScroller) continue;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (cs.position === 'fixed') {
        if (rect.right > vw + TOLERANCE) {
          viol.push({
            type: 'fixed-overflow',
            selector: cssPath(el),
            detail: `fixed element right ${rect.right.toFixed(1)}px > viewport ${vw}px`,
          });
        }
        continue;
      }
      if (rect.right > vw + TOLERANCE) {
        viol.push({
          type: 'element-overflow',
          selector: cssPath(el),
          detail: `right ${rect.right.toFixed(1)}px > viewport ${vw}px (over by ${(rect.right - vw).toFixed(1)}px)`,
        });
      }
    }

    // 3. clipped text (overflow:hidden without text-overflow:ellipsis, whose
    // scrollWidth exceeds clientWidth — real clipping, not intentional
    // single-line truncation).
    const leafTextEls = all.filter((el) => el.children.length === 0 && (el.textContent || '').trim().length > 0);
    for (const el of leafTextEls) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'hidden' && cs.overflow !== 'hidden') continue;
      if (cs.textOverflow === 'ellipsis') continue; // intentional truncation, not a bug
      // sr-only / .visually-hidden technique (1x1px clip-to-nothing for a11y
      // labels) is intentional, not a clipping bug — real clipped content
      // renders at a visible size.
      if (el.clientWidth <= 4 || el.clientHeight <= 4) continue;
      if (el.scrollWidth > el.clientWidth + TOLERANCE) {
        viol.push({
          type: 'clipped-text',
          selector: cssPath(el),
          detail: `scrollWidth ${el.scrollWidth}px > clientWidth ${el.clientWidth}px, text "${(el.textContent || '').trim().slice(0, 40)}"`,
        });
      }
    }

    // 4. sibling overlap inside flex/grid containers (cards/inputs/buttons
    // laid out side by side that should never visually collide).
    const containers = all.filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display === 'flex' || cs.display === 'grid';
    });
    for (const parent of containers) {
      const kids = Array.from(parent.children).filter((k) => {
        if (!(k instanceof HTMLElement)) return false;
        const kcs = getComputedStyle(k);
        return kcs.display !== 'none' && kcs.position !== 'absolute' && kcs.position !== 'fixed' && isVisible(k);
      }) as HTMLElement[];
      for (let i = 0; i < kids.length - 1; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          // A `position: sticky` sibling is *expected* to visually overlap
          // normal-flow content beneath it once the page is scrolled (that's
          // the whole mechanism) — not a layout bug, skip the pair.
          const cs1 = getComputedStyle(kids[i]);
          const cs2 = getComputedStyle(kids[j]);
          if (cs1.position === 'sticky' || cs2.position === 'sticky') continue;
          const r1 = kids[i].getBoundingClientRect();
          const r2 = kids[j].getBoundingClientRect();
          const ix = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
          const iy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
          if (ix > TOLERANCE && iy > TOLERANCE) {
            viol.push({
              type: 'sibling-overlap',
              selector: `${cssPath(kids[i])} <-> ${cssPath(kids[j])}`,
              detail: `overlap ${ix.toFixed(0)}x${iy.toFixed(0)}px inside ${cssPath(parent)}`,
            });
          }
        }
      }
    }

    // 5. form column descendants bleeding into the desktop aside
    // (.cotizador__form-col vs .cotizador__summary-col) — the container grid
    // track can shrink correctly while an oversized child still paints past
    // its own cell edge into the next column. Report only the shallowest
    // offending element per branch (skip if an ancestor already flagged).
    const aside = document.querySelector<HTMLElement>('.cotizador__summary-col');
    const formCol = document.querySelector<HTMLElement>('.cotizador__form-col');
    if (aside && formCol && isVisible(aside)) {
      const asideRect = aside.getBoundingClientRect();
      const flagged = new Set<Element>();
      const descendants = Array.from(formCol.querySelectorAll<HTMLElement>('*'));
      for (const el of descendants) {
        if (!isVisible(el)) continue;
        let anc: Element | null = el.parentElement;
        let ancestorFlagged = false;
        while (anc && anc !== formCol) {
          if (flagged.has(anc)) {
            ancestorFlagged = true;
            break;
          }
          anc = anc.parentElement;
        }
        if (ancestorFlagged) continue;
        const r = el.getBoundingClientRect();
        const ix = Math.min(r.right, asideRect.right) - Math.max(r.left, asideRect.left);
        const iy = Math.min(r.bottom, asideRect.bottom) - Math.max(r.top, asideRect.top);
        if (ix > TOLERANCE && iy > TOLERANCE) {
          flagged.add(el);
          viol.push({
            type: 'form-aside-overlap',
            selector: cssPath(el),
            detail: `form-col descendant right ${r.right.toFixed(1)}px overlaps aside left ${asideRect.left.toFixed(1)}px by ${ix.toFixed(0)}x${iy.toFixed(0)}px`,
          });
        }
      }
    }

    // 6. mobile fixed bottom bar vs the focused/last visible field or CTA in
    // the form column (the bar reserves --cotizador-bottom-bar-height via
    // padding-bottom on .cotizador__form-col — any real intersection means
    // that reservation fell out of sync with the bar's rendered height).
    // Scroll to the *maximum* scroll position first: content sitting under
    // the bar's screen band before scrolling is expected (the user hasn't
    // scrolled it into view yet) — a real bug is content still covered by
    // the bar even at the bottom of the page's own scroll range.
    const bar = document.querySelector<HTMLElement>('.bottom-bar');
    if (bar && formCol && isVisible(bar) && getComputedStyle(bar).position === 'fixed') {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const barRect = bar.getBoundingClientRect();
      const leafCandidates = Array.from(formCol.querySelectorAll<HTMLElement>('input, select, button')).filter(
        (el) => isVisible(el) && !bar.contains(el), // the bar's own CTA lives inside it by design
      );
      const flaggedBar = new Set<Element>();
      for (const el of leafCandidates) {
        let anc: Element | null = el.parentElement;
        let ancestorFlagged = false;
        while (anc && anc !== formCol) {
          if (flaggedBar.has(anc)) {
            ancestorFlagged = true;
            break;
          }
          anc = anc.parentElement;
        }
        if (ancestorFlagged) continue;
        const r = el.getBoundingClientRect();
        const ix = Math.min(r.right, barRect.right) - Math.max(r.left, barRect.left);
        const iy = Math.min(r.bottom, barRect.bottom) - Math.max(r.top, barRect.top);
        if (ix > TOLERANCE && iy > TOLERANCE) {
          flaggedBar.add(el);
          viol.push({
            type: 'bottom-bar-overlap',
            selector: cssPath(el),
            detail: `content bottom ${r.bottom.toFixed(1)}px overlaps fixed bottom-bar top ${barRect.top.toFixed(1)}px by ${ix.toFixed(0)}x${iy.toFixed(0)}px (measured at max scroll)`,
          });
        }
      }
      window.scrollTo(0, 0);
    }

    // 7. every visible <img> must actually be loaded (naturalWidth > 0)
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (!isVisible(img)) continue;
      const iw = (img as HTMLImageElement).naturalWidth;
      if (!iw) {
        viol.push({
          type: 'broken-image',
          selector: cssPath(img),
          detail: `naturalWidth 0, src="${img.getAttribute('src') || img.getAttribute('srcset') || ''}"`,
        });
      }
    }

    // 8. ventana Modelo (Francesa/Bilbao) selector should show an image per
    // option per the product's own product-picker convention — reproduces
    // Carlos's 2026-09-29 report. Flags a violation *now* (known bug) so the
    // sweep stays a real CI guard: this check turns green only once
    // WindowForm.tsx actually renders per-model images.
    if (checkModelImages) {
      const modeloGroup = document.querySelector('[aria-label="Modelo"]');
      if (modeloGroup) {
        const hasImg = modeloGroup.querySelectorAll('img').length > 0;
        if (!hasImg) {
          viol.push({
            type: 'missing-model-image',
            selector: '[aria-label="Modelo"]',
            detail: 'Francesa/Bilbao chips render as text only — no <img> per option (WindowForm.tsx)',
          });
        }
      }
    }

    return viol;
  }, checkModelImages);
}
