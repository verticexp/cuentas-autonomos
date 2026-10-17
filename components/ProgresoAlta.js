import '@/app/alta.css';

// Las mismas dos fases acompañan a la persona desde el registro hasta su primera acción.
export default function ProgresoAlta({ fase, paso, total, etiqueta }) {
  return (
    <div className="alta-progreso">
      <ol className="alta-fases" aria-label="Preparar Netto">
        <li className={fase === 1 ? 'actual' : 'completa'} aria-current={fase === 1 ? 'step' : undefined}>
          <span aria-hidden>{fase === 2 ? '✓' : '1'}</span>Crear tu cuenta
        </li>
        <li className={fase === 2 ? 'actual' : ''} aria-current={fase === 2 ? 'step' : undefined}>
          <span aria-hidden>2</span>Preparar tu negocio
        </li>
      </ol>
      <p className="alta-etapa" role="status">{etiqueta} <span>Paso {paso} de {total}</span></p>
      <div className="alta-barra" role="progressbar" aria-label={fase === 1 ? 'Crear tu cuenta' : 'Preparar tu negocio'} aria-valuemin={0} aria-valuemax={total} aria-valuenow={paso} aria-valuetext={`${etiqueta}, paso ${paso} de ${total}`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < paso ? 'hecho' : ''} />)}
      </div>
    </div>
  );
}
