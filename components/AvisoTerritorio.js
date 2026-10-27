import { conTicketBai, datosTerritorio, esForal } from '@/lib/territorios';
import { textos } from '@/lib/idiomaServidor';

// País Vasco (lib/territorios.js): las facturas salen de un programa TicketBAI dado de alta en la Hacienda foral, que
// las firma, las encadena y les pone su código QR. Fisquo aún no lo está (el alta va a nombre de la empresa que lo
// desarrolla): hasta entonces, se emiten con un programa TicketBAI y se importan en Fisquo para impuestos y contabilidad.
export async function AvisoTicketBai({ fiscal }) {
  if (!conTicketBai(fiscal)) return null;
  const tr = await textos();
  const t = datosTerritorio(fiscal);
  return (
    <p className="aviso-territorio" role="note">
      <strong>TicketBAI.</strong> {tr('En {nombre} las facturas se emiten con un programa TicketBAI dado de alta en la {hacienda}, que las firma y les pone su código QR. Fisquo todavía no lo está: hasta entonces, emite tus facturas con un programa TicketBAI e impórtalas en Fisquo', { nombre: t.nombre, hacienda: tr(t.hacienda) })} (<a href="/ajustes/importar">{tr('Ajustes › Importar datos')}</a>) {tr('para tus impuestos y tu contabilidad.')}
    </p>
  );
}

// Navarra y el País Vasco: los importes salen igual (mismas reglas del IVA), pero se presentan en su Hacienda, con sus
// modelos, sus casillas y sus plazos. Impuestos enseña esos plazos y quita lo que es solo de la AEAT (su fichero).
export async function AvisoHaciendaForal({ fiscal }) {
  if (!esForal(fiscal)) return null;
  const tr = await textos();
  const t = datosTerritorio(fiscal);
  return (
    <p className="aviso-territorio" role="note">
      {tr('Presentas tus impuestos en la')} <strong>{tr(t.hacienda)}</strong>. {tr('Fisquo calcula los importes con las mismas reglas; los modelos, sus casillas y sus plazos son los de tu Hacienda, y se presentan en')} <a href={t.sede} target="_blank" rel="noopener noreferrer">{tr('su sede')}</a>.
    </p>
  );
}
