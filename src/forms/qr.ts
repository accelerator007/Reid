// A form's QR code drawn on a canvas: error correction H (up to 30% of the
// symbol may be covered), rounded modules, distinct corner squares, a clear
// centre for the logo, and the form title with the series name underneath.
import qrcode from 'qrcode-generator';

export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'H');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/** The three 7×7 finder patterns sit in these corners. */
export const inFinder = (row: number, col: number, size: number) =>
  (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);

/** The centre square left empty for the logo: about a fifth of the width, well inside level H's margin. */
export function centreHole(size: number): { from: number; to: number } {
  const span = Math.floor(size * 0.22) | 1;
  const from = Math.floor((size - span) / 2);
  return { from, to: from + span - 1 };
}

type Draw = {
  text: string; title: string; subtitle: string; pixels?: number; ink?: string; accent?: string; paper?: string;
  logo?: HTMLImageElement | null; font?: string; rtl?: boolean;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { out.push(line); line = word; } else line = next;
    if (out.length === lines) break;
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && words.join(' ') !== out.join(' ')) out[lines - 1] = `${out[lines - 1].replace(/\s*\S+$/, '')}…`;
  return out;
}

export function drawQr(canvas: HTMLCanvasElement, options: Draw): void {
  const { text, title, subtitle, pixels = 720, ink = '#1f1633', accent = '#5b3fa6', paper = '#ffffff', logo, font = 'IBM Plex Sans Arabic, Tahoma, sans-serif', rtl = true } = options;
  const matrix = qrMatrix(text);
  const size = matrix.length;
  const quiet = 4;
  const cell = Math.floor(pixels / (size + quiet * 2));
  const side = cell * (size + quiet * 2);
  const footer = Math.round(side * 0.24);
  canvas.width = side;
  canvas.height = side + footer;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const at = (n: number) => (n + quiet) * cell;
  const hole = centreHole(size);
  const inHole = (row: number, col: number) => row >= hole.from && row <= hole.to && col >= hole.from && col <= hole.to;

  ctx.fillStyle = ink;
  const inset = cell * 0.08;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!matrix[row][col] || inFinder(row, col, size) || inHole(row, col)) continue;
      roundRect(ctx, at(col) + inset, at(row) + inset, cell - inset * 2, cell - inset * 2, cell * 0.36);
      ctx.fill();
    }
  }
  // Corner squares: a rounded ring and a rounded centre in the accent colour.
  for (const [row, col] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    ctx.fillStyle = accent;
    roundRect(ctx, at(col), at(row), cell * 7, cell * 7, cell * 1.8);
    ctx.fill();
    ctx.fillStyle = paper;
    roundRect(ctx, at(col) + cell, at(row) + cell, cell * 5, cell * 5, cell * 1.2);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, at(col) + cell * 2, at(row) + cell * 2, cell * 3, cell * 3, cell * 0.9);
    ctx.fill();
  }
  // The centre: a soft tile, with the logo when one is given.
  const holeX = at(hole.from), holeSize = (hole.to - hole.from + 1) * cell;
  ctx.fillStyle = paper;
  roundRect(ctx, holeX, holeX, holeSize, holeSize, cell * 1.4);
  ctx.fill();
  if (logo && logo.complete && logo.naturalWidth) {
    const box = holeSize * 0.68;
    const scale = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
    const w = logo.naturalWidth * scale, h = logo.naturalHeight * scale;
    ctx.drawImage(logo, holeX + (holeSize - w) / 2, holeX + (holeSize - h) / 2, w, h);
  }

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.font = `700 ${Math.round(side * 0.05)}px ${font}`;
  const lines = wrap(ctx, title, side - cell * quiet * 2, 2);
  const lineHeight = Math.round(side * 0.064);
  lines.forEach((line, index) => ctx.fillText(line, side / 2, side + lineHeight * (index + 0.55)));
  ctx.fillStyle = accent;
  ctx.font = `600 ${Math.round(side * 0.036)}px ${font}`;
  ctx.fillText(subtitle, side / 2, side + lineHeight * (lines.length + 0.7));
}

export async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
