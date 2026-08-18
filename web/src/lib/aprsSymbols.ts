/**
 * Official APRS symbol sprites from Heikki Hannikainen (OH7LZB / aprs.fi).
 * https://github.com/hessu/aprs-symbols
 *
 * Sheets are 16 columns × 6 rows. Symbol index = ASCII(code) − 33 ('!' … '~').
 * Table 0 = primary (/), table 1 = alternate (\), table 2 = overlay glyphs.
 * When the symbol table is neither '/' nor '\', it is an overlay character
 * drawn on top of the alternate-table symbol.
 */

const COLUMNS = 16;
const CELL_PX = 48;
/** On-screen size of each marker icon (CSS pixels). */
export const SYMBOL_DISPLAY_PX = 28;

const SHEET_URL = {
  0: '/symbols/aprs-symbols-24-0@2x.png',
  1: '/symbols/aprs-symbols-24-1@2x.png',
  2: '/symbols/aprs-symbols-24-2@2x.png',
} as const;

export type SymbolTableId = 0 | 1 | 2;

export interface AprsSymbolSprite {
  /** Primary or alternate sheet to draw. */
  table: 0 | 1;
  /** Column in the 16-wide grid. */
  column: number;
  /** Row in the 6-tall grid. */
  row: number;
  /** Overlay glyph sheet coordinates, when the table id is an overlay char. */
  overlay?: { column: number; row: number };
}

function symbolIndex(code: string): number {
  const value = code.charCodeAt(0);
  if (!Number.isFinite(value) || value < 33 || value > 126) {
    // Fall back to the primary-table "dot" ('/').
    return '/'.charCodeAt(0) - 33;
  }
  return value - 33;
}

function cellFor(code: string): { column: number; row: number } {
  const index = symbolIndex(code);
  return { column: index % COLUMNS, row: Math.floor(index / COLUMNS) };
}

/**
 * Resolves the sprite-sheet coordinates for an APRS symbol table/code pair.
 * Overlay tables (e.g. 'W' with code '_') use the alternate sheet plus the
 * overlay glyph sheet.
 */
export function resolveAprsSymbol(symbolTable: string, symbolCode: string): AprsSymbolSprite {
  const code = (symbolCode || '/').slice(0, 1);
  const tableChar = (symbolTable || '/').slice(0, 1);
  const cell = cellFor(code);

  if (tableChar === '/') {
    return { table: 0, ...cell };
  }

  if (tableChar === '\\') {
    return { table: 1, ...cell };
  }

  // Overlay character on the alternate table.
  return {
    table: 1,
    ...cell,
    overlay: cellFor(tableChar),
  };
}

function sheetBackground(
  table: SymbolTableId,
  column: number,
  row: number,
  size: number,
): string {
  const scale = size / CELL_PX;
  const sheetWidth = COLUMNS * CELL_PX * scale;
  const sheetHeight = 6 * CELL_PX * scale;
  const x = -(column * size);
  const y = -(row * size);

  return [
    `width:${size}px`,
    `height:${size}px`,
    `background-image:url(${SHEET_URL[table]})`,
    `background-size:${sheetWidth}px ${sheetHeight}px`,
    `background-position:${x}px ${y}px`,
    `background-repeat:no-repeat`,
    `image-rendering:auto`,
  ].join(';');
}

/**
 * Builds the inner HTML for a Leaflet DivIcon that draws the official APRS
 * glyph, an optional overlay character, a transport colour pip and the
 * callsign label.
 */
export function buildAprsSymbolMarkerHtml(options: {
  symbolTable: string;
  symbolCode: string;
  label: string;
  /** RF = emerald, APRS-IS = amber. */
  transportColour: string;
  stale?: boolean;
  size?: number;
}): string {
  const size = options.size ?? SYMBOL_DISPLAY_PX;
  const sprite = resolveAprsSymbol(options.symbolTable, options.symbolCode);
  const opacity = options.stale ? 0.45 : 1;
  const safeLabel = options.label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const overlay = sprite.overlay
    ? `<div style="position:absolute;inset:0;${sheetBackground(2, sprite.overlay.column, sprite.overlay.row, size)}"></div>`
    : '';

  const labelHtml =
    safeLabel.length > 0
      ? `<span style="
        position:absolute;left:${size + 4}px;top:50%;transform:translateY(-50%);
        white-space:nowrap;
        font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
        color:#e2e8f0;
        text-shadow:0 1px 3px #020617,0 0 2px #020617;
      ">${safeLabel}</span>`
      : '';

  return `
    <div style="position:relative;opacity:${opacity};width:${size}px;height:${size}px">
      <div style="position:relative;${sheetBackground(sprite.table, sprite.column, sprite.row, size)};
        filter:drop-shadow(0 1px 2px rgba(0,0,0,.75));">
        ${overlay}
      </div>
      <span style="
        position:absolute;right:-2px;bottom:-2px;
        width:8px;height:8px;border-radius:9999px;
        background:${options.transportColour};
        border:1.5px solid rgba(2,6,23,.9);
        box-shadow:0 0 0 1px ${options.transportColour}55;
      "></span>
      ${labelHtml}
    </div>`;
}

/** Attribution required when redistributing the hessu/aprs-symbols set. */
export const APRS_SYMBOLS_ATTRIBUTION =
  'APRS symbol graphics by Heikki Hannikainen (OH7LZB) — https://github.com/hessu/aprs-symbols';
