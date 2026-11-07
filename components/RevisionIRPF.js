import Ir from './Ir';
import { eur, fechaCorta } from '@/lib/formato';
import '@/app/revision-irpf.css';

// Lista completa del ejercicio, independiente de búsquedas, páginas o filtros de pagos de Gastos.
export default function RevisionIRPF({ gastos, anio, abierto = false, tr }) {
  if (!gastos.length) return abierto ? <p id="revisar-irpf" className="nota" role="status">{tr('No quedan gastos con IVA parcial pendientes de revisar para el IRPF de {anio}.', { anio })}</p> : null;
  return (
    <section id="revisar-irpf" className="revision-irpf bloque" aria-labelledby="revision-irpf-titulo">
      <h2 id="revision-irpf-titulo" className="grupo-t">{tr('Revisa estos gastos para el IRPF')}</h2>
      <p className="nota">{tr('Falta confirmar qué parte corresponde a tu actividad. Hasta que lo revises, Fisquo aplica el 100 % al calcular el gasto o su amortización. El modelo 130 y la renta pueden cambiar al corregirlo.')}</p>
      <details open={abierto}>
        <summary>{gastos.length === 1 ? tr('Revisar 1 gasto para {anio}', { anio }) : tr('Revisar {n} gastos para {anio}', { n: gastos.length, anio })}</summary>
        <ul className="grupo-lista">
          {gastos.map((g) => <li key={g.id}>
            <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
              <span className="txt"><strong>{g.concepto || g.proveedor}</strong><small>{fechaCorta(g.fecha)}{g.proveedor && g.proveedor !== g.concepto ? ` · ${g.proveedor}` : ''}{g.inversion ? ` · ${tr('Bien de inversión')}` : ''}</small></span>
              <span className="imp-col"><span className="imp">{eur(g.base)}</span><small>{tr('Revisar IRPF ›')}</small></span>
            </Ir>
          </li>)}
        </ul>
        <p className="nota">{tr('Abre cada gasto, elige la parte que cuenta en el IRPF y guarda los cambios. El IVA no permite decidir ese porcentaje por ti. Si afecta a un trimestre ya presentado, consulta con tu gestor cómo regularizarlo.')}</p>
      </details>
    </section>
  );
}
