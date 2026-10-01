import { usuarioApi } from '@/lib/api';

// Calendario .ics con los plazos de 303 y 130 (se repiten cada año) y alarmas a las 9:00, 7 días y 1 día antes.
const PLAZOS = [
  ['0420', '1T'], ['0720', '2T'], ['1020', '3T'], ['0130', '4T'],
];

export async function GET() {
  const { res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const y = new Date().getFullYear();
  const eventos = PLAZOS.map(([md, t]) => {
    const inicio = `${t === '4T' ? y + 1 : y}${md}`;
    const extra = t === '4T' ? ' y resumen anual 390' : '';
    return [
      'BEGIN:VEVENT',
      `UID:cuentas-${t}@cuentas`,
      `DTSTAMP:${y}0101T000000Z`,
      `DTSTART;VALUE=DATE:${inicio}`,
      'RRULE:FREQ=YEARLY',
      `SUMMARY:Último día modelos 303 y 130 (${t})${extra}`,
      'DESCRIPTION:Revisa los importes en la app Netto y márcalo como presentado.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Modelos 303 y 130 en 7 días', 'TRIGGER:-P6DT15H', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Mañana acaba el plazo del 303 y 130', 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Netto//ES', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR'].join('\r\n');
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="plazos-hacienda.ics"' } });
}
