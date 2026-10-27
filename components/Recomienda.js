'use client';

import { pedirTexto } from './Confirmar';

import { useEffect, useState } from 'react';
import { useT } from '@/components/Idioma';

// Un texto con una parte en negrita: lo de antes y lo de después se traducen juntos, con la parte destacada en un hueco.
const conDestacado = (tr, texto, destacado) => {
  const [antes, despues = ''] = tr(texto, { x: '\u0001' }).split('\u0001');
  return <>{antes}<strong>{destacado}</strong>{despues}</>;
};

// Ajustes › Recomienda Fisquo (lib/recomendaciones.js): el enlace de la empresa y lo que ha ganado con él.
export default function Recomienda({ enlace, resumen }) {
  const tr = useT();
  const [copiado, setCopiado] = useState(false);
  // «Compartir» solo donde el navegador sabe compartir. Se mira tras montar: el servidor no tiene navigator.share y, si el
  // primer render del navegador lo pintaba, React no casaba el HTML (error #418) y repintaba la página entera.
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  useEffect(() => { setPuedeCompartir(Boolean(navigator.share)); }, []);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { await pedirTexto({ titulo: tr('Copia tu enlace'), texto: tr('Selecciona el enlace y cópialo para compartirlo.'), etiqueta: tr('Enlace de recomendación'), valor: enlace, soloLectura: true, aceptar: tr('Cerrar') }); }
  };
  const compartir = () => navigator.share?.({ title: 'Fisquo', text: tr('Llevo las cuentas de mi negocio con Fisquo. Con mi enlace tienes 2 meses gratis:'), url: enlace }).catch(() => {});
  return <div className="recomienda">
    <section className="tarjeta recomienda-como">
      <h2>{tr('Un mes gratis para cada uno')}</h2>
      <ol>
        <li>{tr('Comparte tu enlace o tu código con otro autónomo o empresa.')}</li>
        <li>{conDestacado(tr, 'Se registra con él y tiene {x} en lugar de uno.', tr('2 meses de prueba'))}</li>
        <li>{conDestacado(tr, 'Cuando hace su primer pago, {x}: te lo descontamos de la siguiente factura (o te alargamos la prueba si aún no pagas).', tr('tú ganas un mes gratis'))}</li>
      </ol>
      {resumen.fundador && <p className="nota">{tr('Tu empresa ya es gratis de por vida con el plan Fundador, pero a quien invites le regalas igualmente su mes extra.')}</p>}
    </section>
    <section className="tarjeta">
      <h2>{tr('Tu enlace')}</h2>
      <p className="recomienda-enlace"><code>{enlace}</code></p>
      <div className="recomienda-botones">
        <button type="button" className="boton pequeno" onClick={copiar}>{copiado ? tr('Copiado') : tr('Copiar enlace')}</button>
        {puedeCompartir && <button type="button" className="boton pequeno sec" onClick={compartir}>{tr('Compartir')}</button>}
      </div>
      {resumen.codigo && <p className="nota">{conDestacado(tr, 'También puede escribir tu código {x} en «Código promocional» al registrarse.', resumen.codigo)}</p>}
      <p className="nota" role="status" aria-live="polite">{copiado ? tr('Enlace copiado.') : ''}</p>
    </section>
    <section className="tarjeta recomienda-cifras" aria-label={tr('Tus recomendaciones')}>
      <div><strong>{resumen.registradas}</strong><span>{tr('se han registrado')}</span></div>
      <div><strong>{resumen.pagando}</strong><span>{tr('ya pagan')}</span></div>
      <div><strong>{resumen.meses}</strong><span>{resumen.meses === 1 ? tr('mes ganado') : tr('meses ganados')} {tr('(máx. {max})', { max: resumen.max })}</span></div>
    </section>
  </div>;
}
