import { conTicketBai, datosTerritorio, esForal } from '@/lib/territorios';

// País Vasco (lib/territorios.js): las facturas salen de un programa TicketBAI dado de alta en la Hacienda foral, que
// las firma, las encadena y les pone su código QR. Fisquo aún no lo está (el alta va a nombre de la empresa que lo
// desarrolla): hasta entonces, se emiten con un programa TicketBAI y se importan en Fisquo para impuestos y contabilidad.
export function AvisoTicketBai({ fiscal }) {
  if (!conTicketBai(fiscal)) return null;
  const t = datosTerritorio(fiscal);
  return (
    <p className="aviso-territorio" role="note">
      <strong>TicketBAI.</strong> En {t.nombre} las facturas se emiten con un programa TicketBAI dado de alta en la {t.hacienda}, que las firma y les pone su código QR. Fisquo todavía no lo está: hasta entonces, emite tus facturas con un programa TicketBAI e impórtalas en Fisquo (<a href="/ajustes/importar">Ajustes › Importar datos</a>) para tus impuestos y tu contabilidad.
    </p>
  );
}

// Navarra y el País Vasco: los importes salen igual (mismas reglas del IVA), pero se presentan en su Hacienda, con sus
// modelos, sus casillas y sus plazos. Impuestos enseña esos plazos y quita lo que es solo de la AEAT (su fichero).
export function AvisoHaciendaForal({ fiscal }) {
  if (!esForal(fiscal)) return null;
  const t = datosTerritorio(fiscal);
  return (
    <p className="aviso-territorio" role="note">
      Presentas tus impuestos en la <strong>{t.hacienda}</strong>. Fisquo calcula los importes con las mismas reglas; los modelos, sus casillas y sus plazos son los de tu Hacienda, y se presentan en <a href={t.sede} target="_blank" rel="noopener noreferrer">su sede</a>.
    </p>
  );
}
