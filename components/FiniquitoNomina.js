'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { navegar } from '@/lib/transicion';
import { llamar } from './Acciones';
import { CAUSAS_FINIQUITO } from '@/lib/finiquito';
import { calculoNomina } from '@/lib/nominas';
import { eur } from '@/lib/formato';

export default function FiniquitoNomina({ empleado, hoy, existente }) {
  const router = useRouter();
  const [datos, setDatos] = useState({ baja: empleado.baja || hoy, causa: 'voluntaria', vacacionesDisfrutadas: 0, devengoPagas: 'semestral', conciliacion: false });
  const [resultado, setResultado] = useState(null), [error, setError] = useState(''), [enviando, setEnviando] = useState(false);
  const poner = (k, v) => { setDatos({ ...datos, [k]: v }); setResultado(null); setError(''); };
  async function enviar(guardar) {
    setEnviando(true); setError('');
    try {
      const r = await llamar('/api/nominas', { method: 'POST', body: JSON.stringify({ tipo: 'finiquito', empleado: empleado.id, datos, guardar }) });
      if (guardar) { navegar(router, `/nominas/${r.id}`, 'adelante', undefined, true); router.refresh(); }
      else setResultado(r.finiquito);
    } catch (e) { setError(e.message); }
    setEnviando(false);
  }
  if (existente) return <p>Este empleado ya tiene un finiquito. <a className="boton sec" href={`/nominas/${existente}`}>Ver finiquito</a></p>;
  const c = resultado && calculoNomina(resultado);
  return <>
    <form className="formulario tarjeta" onSubmit={(ev) => { ev.preventDefault(); enviar(false); }}>
      <label>Fecha de baja<input className="campo" type="date" min={empleado.alta} value={datos.baja} onChange={(ev) => poner('baja', ev.target.value)} required /></label>
      <label>Causa<select className="campo" value={datos.causa} onChange={(ev) => poner('causa', ev.target.value)}>{Object.entries(CAUSAS_FINIQUITO).map(([k, texto]) => <option key={k} value={k}>{texto}</option>)}</select></label>
      {datos.causa === 'improcedente' && <label className="check"><input type="checkbox" checked={datos.conciliacion} onChange={(ev) => poner('conciliacion', ev.target.checked)} /> La improcedencia está reconocida en acto de conciliación o resolución judicial (para la exención de IRPF)</label>}
      <label>Días naturales de vacaciones ya disfrutados este año<input className="campo" inputMode="decimal" value={datos.vacacionesDisfrutadas} onChange={(ev) => poner('vacacionesDisfrutadas', ev.target.value)} required /></label>
      <label>Devengo de las pagas extra<select className="campo" value={datos.devengoPagas} onChange={(ev) => poner('devengoPagas', ev.target.value)}><option value="semestral">Semestral (enero-junio y julio-diciembre)</option><option value="anual">Anual, desde el último vencimiento</option></select></label>
      <p className="nota">Vacaciones: mínimo de 30 días naturales al año. Cada paga extra equivale al sueldo mensual, con vencimientos en junio y diciembre. Revisa con la gestoría las mejoras de convenio y los pagos que no estén registrados.</p>
      <button className="boton" disabled={enviando}>{enviando ? 'Calculando…' : 'Calcular finiquito'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {resultado && <section className="tarjeta bloque" aria-label="Resultado del finiquito" aria-live="polite">
      <dl className="nomina-desglose">
        {resultado.finiquito.lineas.map((l) => <div key={l.concepto} style={{ display: 'contents' }}><dt>{l.concepto}</dt><dd>{eur(l.importe)}</dd></div>)}
        <dt>Retención IRPF ({resultado.irpfPct} %)</dt><dd>−{eur(c.irpf)}</dd>
        <dt>Seguridad Social del trabajador</dt><dd>−{eur(c.ssTrabajador)}</dd>
        <dt><strong>Líquido a pagar</strong></dt><dd><strong>{eur(c.neto)}</strong></dd>
      </dl>
      {resultado.finiquito.avisos.map((a) => <p className="nota" key={a}>{a}</p>)}
      <button className="boton ancho" disabled={enviando} onClick={() => enviar(true)}>{enviando ? 'Guardando…' : 'Guardar finiquito y dar de baja'}</button>
      <p className="nota">Se guarda como nómina especial y como gasto. El recibo PDF estará disponible en su detalle. La gestoría comunica la baja a la Seguridad Social.</p>
    </section>}
  </>;
}
