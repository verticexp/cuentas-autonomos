'use client';

import '@/app/alta.css';

// Progreso del alta (registro, confirmar el email y preparar el negocio): un solo indicador, el nombre del paso y
// «Paso x de y» con su barra. Antes iban también las dos fases encima y un botón de volver arriba (repetido con el
// «Atrás» de abajo): dos marcadores de progreso a la vez.
export default function ProgresoAlta({ paso, total, etiqueta }) {
  return (
    <div className="alta-progreso">
      <p className="alta-etapa" role="status">{etiqueta} <span>Paso {paso} de {total}</span></p>
      <div className="alta-barra" role="progressbar" aria-label="Progreso del alta" aria-valuemin={0} aria-valuemax={total} aria-valuenow={paso} aria-valuetext={`${etiqueta}, paso ${paso} de ${total}`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < paso ? 'hecho' : ''} />)}
      </div>
    </div>
  );
}
