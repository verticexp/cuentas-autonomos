import { usuarioApi } from '@/lib/api';
import { plazosFiscales } from '@/lib/avisos';
import { fiscalDe } from '@/lib/empresa';

// Calendario .ics con los plazos de Hacienda (y del Registro Mercantil) que le tocan a la empresa, de este año y el que
// viene, con alarmas a las 9:00, 7 días y 1 día antes. Los mismos que los avisos del móvil (lib/avisos.js).
export async function GET() {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const y = new Date().getFullYear();
  const plazos = [...plazosFiscales(fiscalDe(u), y, { cuotaIS: u.cuotaIS }), ...plazosFiscales(fiscalDe(u), y + 1)];
  const eventos = plazos.map(({ fecha, texto }) => {
    const dia = fecha.replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:netto-${dia}@nettohq.com`,
      `DTSTAMP:${y}0101T000000Z`,
      `DTSTART;VALUE=DATE:${dia}`,
      `SUMMARY:Último día: ${texto}`,
      'DESCRIPTION:Revisa los importes en Impuestos (Netto) y márcalo como presentado.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:En 7 días: ${texto}`, 'TRIGGER:-P6DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:Mañana acaba el plazo: ${texto}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Netto//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR'].join('\r\n');
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="plazos-hacienda.ics"' } });
}
