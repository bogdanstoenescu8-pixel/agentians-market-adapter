/**
 * Deterministic hex color derived from a token symbol.
 *
 * Uses an FNV-1a hash of the (upper-cased) symbol to pick a hue, then converts
 * a fixed-saturation/lightness HSL color to hex. The same symbol always yields
 * the same color, so the UI stays stable across refreshes even when the data
 * source provides no image/color of its own.
 */
export function colorFromSymbol(symbol: string): string {
  const s = (symbol ?? "").trim().toUpperCase();
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV-1a 32-bit prime
  }
  const hue = (h >>> 0) % 360;
  return hslToHex(hue, 55, 60);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color);
  };
  const toHex = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
