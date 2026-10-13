// Redondeo al céntimo (auditoría F09): mitad lejos del cero, igual en positivo y en negativo (una rectificativa es el
// espejo exacto de su factura), sin el error binario de la coma flotante (1,005 € → 1,01 €, no 1,00 €) y sin «−0».
// Política: cada línea se redondea al céntimo; la cuota de IVA, por tipo sobre la suma de bases de ese tipo; la
// retención, sobre la base total; el total, base + IVA − retención.
const redondeo = (dec) => (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return x;
  const f = 10 ** dec;
  const v = Math.round(Number((Math.abs(x) * f).toPrecision(15))) / f;
  return x < 0 && v ? -v : v;
};
export const r2 = redondeo(2);
// Cantidades (unidades, horas): hasta milésimas.
export const r3 = redondeo(3);
