import Ir from './Ir';
import { ORIGENES } from '@/lib/importarOrigen';
import styles from './VienesDeOtroPrograma.module.css';

// Tarjeta del final del alta y de los primeros pasos del Resumen: lleva a la importación con el origen ya elegido
// (/ajustes/importar?origen=…, components/Importar.js), que dice qué exportar de cada programa, o a la demo con datos de
// ejemplo (/demo, en otra pestaña).
export default function VienesDeOtroPrograma() {
  return (
    <section className={styles.tarjeta} aria-labelledby="viene-de-otro-t">
      <h2 className={styles.titulo} id="viene-de-otro-t">¿Vienes de otro programa?</h2>
      <p className={styles.texto}>Trae tus clientes, facturas y gastos en vez de empezar de cero. Elige de dónde vienes y te decimos qué exportar.</p>
      <ul className={styles.lista}>
        {ORIGENES.map((o) => (
          <li key={o.id}>
            <Ir href={`/ajustes/importar?origen=${o.id}`} tipo="adelante" className={styles.opcion}>
              <span className={styles.nombre}>{o.nombre}</span>
              <small className={styles.detalle}>{o.resumen}</small>
            </Ir>
          </li>
        ))}
      </ul>
      {/* Datos de ejemplo: en la demo pública, nunca en la cuenta (se mezclarían con las declaraciones de verdad). */}
      <p className={`${styles.texto} solo-web`}>¿Prefieres verlo antes con datos de ejemplo? <a href="/demo" target="_blank" rel="noopener">Recorre la demo</a>: no toca tu cuenta.</p>
    </section>
  );
}
