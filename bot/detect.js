// Lógica pura: interpretar precios y decidir si una oferta parece un error de precio.

/** "1.299,99 €" | "1,299.99" | "0,00" | 12.5 -> número, o null. */
export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El último separador es el decimal; el otro es de millares.
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma > -1) {
    s = /,\d{3}$/.test(s) && s.indexOf(',') === lastComma && s.length > 4 ? s.replace(',', '') : s.replace(',', '.');
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && s.indexOf('.') === lastDot) {
    s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Clasifica una oferta.
 *  - 'zero': precio <= zeroMax con un precio de referencia razonable (evita "0 €" de productos sin stock/precio).
 *  - 'deep': descuento >= minDiscount sobre la referencia.
 * La referencia es el precio tachado/anterior de la página o, si no hay, el último precio normal visto.
 */
export function classify({ price, reference, inStock = true }, opts = {}) {
  const { zeroMax = 0.99, minDiscount = 80, minReference = 15 } = opts;
  if (price == null || !inStock) return null;
  const hasRef = reference != null && reference >= minReference && reference > price;
  const discount = hasRef ? Math.round((1 - price / reference) * 1000) / 10 : null;
  if (price <= zeroMax && hasRef) return { kind: 'zero', discount };
  if (discount != null && discount >= minDiscount) return { kind: 'deep', discount };
  return null;
}
