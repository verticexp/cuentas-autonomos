'use client';

import '@/app/alta.css';
import { useT } from '@/components/Idioma';

// Progreso del alta (registro, confirmar el email y preparar el negocio): un solo indicador, el nombre del paso y
// «Paso x de y» con su barra. Antes iban también las dos fases encima y un botón de volver arriba (repetido con el
// «Atrás» de abajo): dos marcadores de progreso a la vez.
export default function ProgresoAlta({ paso, total, etiqueta }) {
  const tr = useT();
  return (
    <div className="alta-progreso">
      <p className="alta-etapa" role="status">{tr(etiqueta)} <span>{tr('Paso {paso} de {total}', { paso, total })}</span></p>
      <div className="alta-barra" role="progressbar" aria-label={tr('Progreso del alta')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={paso} aria-valuetext={tr('{etiqueta}, paso {paso} de {total}', { etiqueta: tr(etiqueta), paso, total })}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < paso ? 'hecho' : ''} />)}
      </div>
    </div>
  );
}
