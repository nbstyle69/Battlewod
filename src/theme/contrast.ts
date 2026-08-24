/**
 * Ratio de contraste WCAG 2.1, avec composition des couches translucides :
 * les cartes du thème le sont, et un ratio calculé sur `rgba(255,255,255,0.06)`
 * pris pour du blanc opaque déclarerait lisible ce qui ne l'est pas.
 *
 * Sert aux contrôles de lisibilité des thèmes (src/__tests__/themeContrast).
 */
type Rgb = { r: number; g: number; b: number; a: number };

function parse(color: string): Rgb {
  if (color.startsWith('rgb')) {
    const parts = color.match(/[\d.]+/g);
    if (!parts) throw new Error(`couleur illisible : ${color}`);
    const [r, g, b, a] = parts.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

/** Compose une couleur translucide sur son fond : les cartes du thème le sont. */
function flatten(color: string, behind: Rgb): Rgb {
  const c = parse(color);
  return {
    r: c.r * c.a + behind.r * (1 - c.a),
    g: c.g * c.a + behind.g * (1 - c.a),
    b: c.b * c.a + behind.b * (1 - c.a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgb): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrast(fg: string, bg: string, behind?: string): number {
  const base = behind ? parse(behind) : { r: 255, g: 255, b: 255, a: 1 };
  const bgFlat = flatten(bg, base);
  const fgFlat = flatten(fg, bgFlat);
  const l1 = luminance(fgFlat);
  const l2 = luminance(bgFlat);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
