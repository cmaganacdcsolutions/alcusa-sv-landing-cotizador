import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { QUOTE_COMPANY, type QuoteCompanyConfig } from './config';
import { formatDateSv, formatUsd } from './format';
import { BAND_H, COLORS, CUSTOMER, FOOTER, HEADER, LOGO, M, META, PAGE, TABLE, TAIL } from './layout';
import type { QuoteDocument, QuoteDocumentItem, QuotePdfAssets } from './types';

type Rgb = readonly [number, number, number];
const c = (v: Rgb) => rgb(v[0] / 255, v[1] / 255, v[2] / 255);

interface Fonts {
  display: PDFFont;
  regular: PDFFont;
  bold: PDFFont;
}
interface RowPlan {
  item: QuoteDocumentItem;
  nameLines: string[];
  h: number;
}
interface PagePlan {
  first: boolean;
  rows: RowPlan[];
  tail: boolean;
}

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || font.widthOfTextAtSize(next, size) <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const head = lines.slice(0, maxLines);
  head[maxLines - 1] = fit(lines.slice(maxLines - 1).join(' '), font, size, maxW);
  return head;
}

function planPages(doc: QuoteDocument, f: Fonts, tailH: number): PagePlan[] {
  const rows: RowPlan[] = doc.items.map((item) => {
    const nameLines = wrap(item.name, f.bold, 10.5, TABLE.nameMaxW, 2);
    return { item, nameLines, h: TABLE.rowH + TABLE.lineH * (nameLines.length - 1) };
  });
  const pages: PagePlan[] = [{ first: true, rows: [], tail: false }];
  let y = TABLE.firstRow;
  for (const r of rows) {
    if (y + r.h > FOOTER.limit) {
      pages.push({ first: false, rows: [], tail: false });
      y = TABLE.contHeadTop + TABLE.headH;
    }
    pages[pages.length - 1]!.rows.push(r);
    y += r.h;
  }
  if (y + TAIL.gap + tailH > FOOTER.limit) pages.push({ first: false, rows: [], tail: true });
  else pages[pages.length - 1]!.tail = true;
  return pages;
}

export async function renderQuotePdf(
  doc: QuoteDocument,
  assets: QuotePdfAssets = {},
  company: QuoteCompanyConfig = QUOTE_COMPANY,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  let f: Fonts;
  try {
    if (!assets.fonts) throw new Error('no font bytes');
    f = {
      display: await pdf.embedFont(assets.fonts.fraunces600, { subset: true }),
      regular: await pdf.embedFont(assets.fonts.manrope400, { subset: true }),
      bold: await pdf.embedFont(assets.fonts.manrope700, { subset: true }),
    };
  } catch (err) {
    console.warn('[quote-pdf] brand fonts unavailable, using Helvetica', err);
    f = {
      display: await pdf.embedFont(StandardFonts.TimesRomanBold),
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
  }
  let logo: PDFImage | null = null;
  if (assets.logoPng) {
    try {
      logo = await pdf.embedPng(assets.logoPng);
    } catch {
      logo = null;
    }
  }

  const showIva = !company.ivaNote.placeholder;
  const ivaLines = showIva ? wrap(`${company.currencyNote} ${company.ivaNote.value}`, f.regular, 9, M.width - 32, 4) : [];
  const ivaH = showIva ? TAIL.ivaH + 12 * (ivaLines.length - 1) : 0;
  const contactTop = TAIL.contactTopNoIva + (showIva ? ivaH + TAIL.ivaGap : 0);
  const pages = planPages(doc, f, contactTop + TAIL.contactBoxH);

  const rect = (p: PDFPage, x: number, top: number, w: number, h: number, fill: Rgb, border?: Rgb): void => {
    const i = border ? 0.375 : 0;
    p.drawRectangle({
      x: x + i,
      y: PAGE.h - top - h + i,
      width: w - 2 * i,
      height: h - 2 * i,
      color: c(fill),
      ...(border ? { borderColor: c(border), borderWidth: 0.75 } : {}),
    });
  };
  const hline = (p: PDFPage, x1: number, x2: number, y: number): void =>
    p.drawLine({ start: { x: x1, y: PAGE.h - y }, end: { x: x2, y: PAGE.h - y }, thickness: 0.75, color: c(COLORS.border) });
  const text = (p: PDFPage, s: string, x: number, base: number, font: PDFFont, size: number, col: Rgb, right = false): void =>
    p.drawText(s, { x: right ? x - font.widthOfTextAtSize(s, size) : x, y: PAGE.h - base, size, font, color: c(col) });

  function drawTail(p: PDFPage, top: number): void {
    const d = top - TAIL.boardTop;
    const B = (v: number): number => v + d;
    const pct = company.paymentScheme.anticipoPct;
    const anticipo = Math.round(doc.total * pct) / 100;
    const saldo = Math.round((doc.total - anticipo) * 100) / 100;
    const subtotal = Math.round((doc.total - doc.transport) * 100) / 100;
    rect(p, M.left, B(429), TAIL.schemeW, TAIL.schemeH, COLORS.soft);
    rect(p, 48, B(460.5), TAIL.trackW, TAIL.trackH, COLORS.track);
    rect(p, 48, B(460.5), (TAIL.trackW * pct) / 100, TAIL.trackH, COLORS.primary);
    rect(p, 334.5, B(489), 225, 39, COLORS.tint);
    hline(p, 334.5, M.right, B(480));
    text(p, 'Esquema de pago', 48, B(448.65), f.bold, 10.5, COLORS.ink);
    text(p, `Anticipo ${pct}% al confirmar`, 48, B(484.2), f.regular, 9, COLORS.muted);
    text(p, formatUsd(anticipo), 301.5, B(484.65), f.bold, 10.5, COLORS.ink, true);
    text(p, `Saldo ${100 - pct}% contra instalación`, 48, B(505.2), f.regular, 9, COLORS.muted);
    text(p, formatUsd(saldo), 301.5, B(505.65), f.bold, 10.5, COLORS.ink, true);
    text(p, 'Subtotal productos', 334.5, B(441.15), f.regular, 10.5, COLORS.muted);
    text(p, formatUsd(subtotal), M.right, B(441.15), f.bold, 10.5, COLORS.ink, true);
    text(p, doc.transportLabel ? `Transporte · ${doc.transportLabel}` : 'Transporte', 334.5, B(465.15), f.regular, 10.5, COLORS.muted);
    text(p, formatUsd(doc.transport), M.right, B(465.15), f.bold, 10.5, COLORS.ink, true);
    text(p, 'Total', 346.5, B(514.5), f.bold, 12, COLORS.ink);
    text(p, formatUsd(doc.total), 547.5, B(514.5), f.display, 21, COLORS.primary, true);
    if (showIva) {
      const ivaTop = B(546);
      rect(p, M.left, ivaTop, M.width, ivaH, COLORS.soft);
      ivaLines.forEach((ln, i) => text(p, ln, 48, ivaTop + 22.2 + i * 12, f.regular, 9, COLORS.muted));
    }
    const boxTop = top + contactTop;
    text(p, 'CONTACTO', M.left, boxTop - 9.3, f.bold, 9, COLORS.primary);
    rect(p, M.left, boxTop, M.width, TAIL.contactBoxH, COLORS.white, COLORS.border);
    const cells: Array<[string, string]> = [
      ['WhatsApp', company.whatsappDisplay],
      ...company.channels.slice(0, 3).map((ch): [string, string] => [ch.label, ch.value]),
    ];
    const pos: Array<[number, number]> = [[48, 0], [307.5, 0], [48, 39], [307.5, 39]];
    cells.forEach(([label, value], i) => {
      const [x, dy] = pos[i]!;
      text(p, label, x, boxTop + 17.7 + dy, f.regular, 9, COLORS.muted);
      text(p, value, x, boxTop + 33.15 + dy, f.bold, 10.5, COLORS.ink);
    });
  }

  const total = pages.length;
  pages.forEach((pg, idx) => {
    const p = pdf.addPage([PAGE.w, PAGE.h]);
    rect(p, 0, 0, PAGE.w, BAND_H, COLORS.primary);
    rect(p, 0, PAGE.h - BAND_H, PAGE.w, BAND_H, COLORS.primary);
    hline(p, M.left, M.right, HEADER.ruleY);
    hline(p, M.left, M.right, FOOTER.ruleY);
    if (logo) p.drawImage(logo, { x: LOGO.x, y: PAGE.h - LOGO.top - LOGO.size, width: LOGO.size, height: LOGO.size });
    text(p, company.name, HEADER.nameX, HEADER.nameBase, f.display, 21, COLORS.primary);
    text(p, 'Cotización', M.right, HEADER.titleBase, f.display, 24, COLORS.ink, true);
    text(p, `N.º ${doc.folio}`, M.right, HEADER.folioBase, f.bold, 10.5, COLORS.primary, true);
    text(p, `${company.name.toUpperCase()} · Cotización N.º ${doc.folio}`, M.left, FOOTER.base, f.regular, 9, COLORS.muted);
    text(p, `Página ${idx + 1}/${total}`, M.right, FOOTER.base, f.regular, 9, COLORS.muted, true);

    let headTop: number = TABLE.contHeadTop;
    if (pg.first) {
      rect(p, M.left, META.top, M.width, META.h, COLORS.soft);
      text(p, 'Fecha', META.dateX, META.labelBase, f.regular, 9, COLORS.muted);
      text(p, formatDateSv(doc.issuedAt), META.dateX, META.valueBase, f.bold, 10.5, COLORS.ink);
      text(p, 'Válida por', META.validX, META.labelBase, f.regular, 9, COLORS.muted);
      text(p, `${company.validityDays.value} días`, META.validX, META.valueBase, f.bold, 10.5, COLORS.ink);
      text(p, 'DATOS DEL CLIENTE', M.left, CUSTOMER.kickerBase, f.bold, 9, COLORS.primary);
      rect(p, M.left, CUSTOMER.boxTop, M.width, CUSTOMER.boxH, COLORS.white, COLORS.border);
      const cu = doc.customer;
      const vals = [fit(cu.name || '—', f.bold, 10.5, CUSTOMER.maxNameW), cu.phone || '—', cu.zone || '—'];
      ['Nombre', 'Teléfono', 'Zona'].forEach((l, i) => {
        text(p, l, CUSTOMER.xs[i]!, CUSTOMER.labelBase, f.regular, 9, COLORS.muted);
        text(p, vals[i]!, CUSTOMER.xs[i]!, CUSTOMER.valueBase, f.bold, 10.5, COLORS.ink);
      });
      text(p, 'DETALLE DE LA COTIZACIÓN', M.left, TABLE.kickerBase, f.bold, 9, COLORS.primary);
      headTop = TABLE.headTop;
    }
    let y = headTop + TABLE.headH;
    if (pg.rows.length) {
      rect(p, M.left, headTop, M.width, TABLE.headH, COLORS.tint);
      const hb = headTop + (TABLE.headBase - TABLE.headTop);
      text(p, 'Producto', TABLE.xName, hb, f.bold, 9, COLORS.primary);
      text(p, 'Variante / acabado', TABLE.xVariant, hb, f.bold, 9, COLORS.primary);
      text(p, 'Medidas (cm)', TABLE.xMeasures, hb, f.bold, 9, COLORS.primary);
      text(p, 'Cant.', TABLE.xQtyHead, hb, f.bold, 9, COLORS.primary);
      text(p, 'Precio', TABLE.xPriceRight, hb, f.bold, 9, COLORS.primary, true);
      for (const r of pg.rows) {
        const b = y + TABLE.rowBase;
        r.nameLines.forEach((ln, i) => text(p, ln, TABLE.xName, b + i * TABLE.lineH, f.bold, 10.5, COLORS.ink));
        text(p, fit(r.item.variant, f.regular, 10.5, TABLE.variantMaxW), TABLE.xVariant, b, f.regular, 10.5, COLORS.ink);
        text(p, fit(r.item.measures, f.regular, 10.5, TABLE.measuresMaxW), TABLE.xMeasures, b, f.regular, 10.5, COLORS.ink);
        const q = String(r.item.qty);
        text(p, q, TABLE.xQtyCenter - f.regular.widthOfTextAtSize(q, 10.5) / 2, b, f.regular, 10.5, COLORS.ink);
        text(p, formatUsd(r.item.price), TABLE.xPriceRight, b, f.bold, 10.5, COLORS.ink, true);
        y += r.h;
        hline(p, M.left, M.right, y);
      }
      if (pg.tail) drawTail(p, y + TAIL.gap);
    } else if (pg.tail) {
      drawTail(p, TABLE.contHeadTop);
    }
  });

  pdf.setTitle(`Cotización ${doc.folio}`);
  pdf.setAuthor(company.author);
  pdf.setCreator(company.author);
  pdf.setProducer(company.author);
  pdf.setCreationDate(doc.issuedAt);
  pdf.setModificationDate(doc.issuedAt);
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of(company.language));
  return pdf.save({ useObjectStreams: false });
}
