// Conserva el día, o usa el último del mes de destino si no existe.
export const sumarMeses = (fecha, n) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const destino = new Date(`${fecha}T12:00:00Z`);
  destino.setUTCDate(1);
  destino.setUTCFullYear(anio, mes - 1 + n + 1, 0);
  destino.setUTCDate(Math.min(dia, destino.getUTCDate()));
  return destino.toISOString().slice(0, 10);
};

const formatoFecha = (fecha) => fecha.split('-').reverse().join('/');

export const requisitosIncobrable = ({ fechaOriginal, fechaRectificativa, base, grande = false }) => {
  const desde = sumarMeses(fechaOriginal, grande ? 12 : 6);
  const hasta = sumarMeses(desde, 6);
  const errores = [];
  const avisos = [];
  if (fechaRectificativa < desde) errores.push(`Aún no es un crédito incobrable: hasta el ${formatoFecha(desde)} no pasan ${grande ? 'un año' : 'seis meses'} desde la factura (art. 80.Cuatro de la Ley del IVA).`);
  if (fechaRectificativa > hasta) errores.push(`Fuera de plazo: la rectificativa por impago se emite entre el ${formatoFecha(desde)} y el ${formatoFecha(hasta)} (los seis meses siguientes, art. 80.Cuatro).`);
  if (base <= 50) avisos.push('Si el cliente es un particular, solo se puede si la base de la factura pasa de 50 €.');
  const limite952 = sumarMeses(fechaRectificativa, 1);
  const requisitos = [
    'Haber reclamado el cobro al cliente por vía judicial o con requerimiento notarial (o por otro medio fehaciente cuando la ley lo admite).',
    'Que el impago conste en los libros registro.',
    'Enviar la rectificativa al cliente.',
    'Comunicarlo a Hacienda con el modelo 952 en un mes, con copia de la rectificativa y de la reclamación.',
  ];
  return { errores, avisos, desde, hasta, limite952, requisitos };
};
