'use client';

import Ir from './Ir';
import { ORIGENES } from '@/lib/importarOrigen';
import { useT } from '@/components/Idioma';
import styles from './VienesDeOtroPrograma.module.css';

// Tarjeta del final del alta y de los primeros pasos del Resumen: lleva a la importación con el origen ya elegido
// (/ajustes/importar?origen=…, components/Importar.js), que dice qué exportar de cada programa, o a la demo con datos de
// ejemplo (/demo, en otra pestaña).
export default function VienesDeOtroPrograma() {
  const tr = useT();
  const demo = tr('¿Prefieres verlo antes con datos de ejemplo? {x}: no toca tu cuenta.', { x: '\u0001' }).split('\u0001');
  return (
    <section className={styles.tarjeta} aria-labelledby="viene-de-otro-t">
      <h2 className={styles.titulo} id="viene-de-otro-t">{tr('¿Vienes de otro programa?')}</h2>
      <p className={styles.texto}>{tr('Trae tus clientes, facturas y gastos en vez de empezar de cero. Elige de dónde vienes y te decimos qué exportar.')}</p>
      <ul className={styles.lista}>
        {ORIGENES.map((o) => (
          <li key={o.id}>
            <Ir href={`/ajustes/importar?origen=${o.id}`} tipo="adelante" className={styles.opcion}>
              <span className={styles.nombre}>{tr(o.nombre)}</span>
              <small className={styles.detalle}>{tr(o.resumen)}</small>
            </Ir>
          </li>
        ))}
      </ul>
      {/* Datos de ejemplo: en la demo pública, nunca en la cuenta (se mezclarían con las declaraciones de verdad). */}
      <p className={`${styles.texto} solo-web`}>{demo[0]}<a href="/demo" target="_blank" rel="noopener">{tr('Recorre la demo')}</a>{demo[1]}</p>
    </section>
  );
}
