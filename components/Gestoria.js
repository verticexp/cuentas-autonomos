'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Ir from '@/components/Ir';
import { llamar } from './Acciones';

// Ajustes › Tu gestoría. gestoria: { nombre, email, auto } o null. trimestres: [{ anio, t }] del más reciente al más
// antiguo (el primero, el último cerrado). invitar: si puede dar acceso a Netto (Usuarios). emailListo: si hay correo.
export default function Gestoria({ gestoria, trimestres, invitar, emailListo, app = false }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: gestoria?.nombre || '', email: gestoria?.email || '', auto: Boolean(gestoria?.auto) });
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState(0);
  const [envio, setEnvio] = useState('');

  const guardar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ gestoria: d }) }); setMsg('Guardado'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const mandar = async () => {
    const { anio, t } = trimestres[sel];
    setEnvio('Preparando y enviando el paquete…');
    try {
      const r = await llamar('/api/paquete', { method: 'POST', body: JSON.stringify({ anio, t }) });
      setEnvio(`✓ Enviado a ${r.para}${r.sinJustificantes ? ' (sin los justificantes: no cabían en el correo)' : ''}`);
    } catch (err) { setEnvio(err.message); }
  };
  const guardada = Boolean(gestoria?.email);

  return (
    <>
      <form className="formulario tarjeta" onSubmit={guardar}>
        <h3>Datos de tu gestoría</h3>
        <label>Nombre (opcional)<input className="campo" value={d.nombre} maxLength={120} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Gestoría López" /></label>
        <label>Email<input className="campo" type="email" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="tu@gestoria.es" /></label>
        <label className="check ges-auto"><input type="checkbox" checked={d.auto} onChange={(e) => setD({ ...d, auto: e.target.checked })} disabled={!emailListo} />
          <span>Mandarle el paquete solo al acabar cada trimestre<small>El día 5 de enero, abril, julio y octubre: facturas, gastos con sus justificantes, nóminas e impuestos del trimestre.</small></span></label>
        {msg && <p role="status" className={msg === 'Guardado' ? 'nota guardado' : msg === 'Guardando…' ? 'nota' : 'error'}>{msg === 'Guardado' ? '✓ Guardado' : msg}</p>}
        <button className="boton">Guardar</button>
      </form>

      <section className="grupo">
        <h2 className="grupo-t">Mandar el paquete ahora</h2>
        <div className="grupo-c relleno">
          <label className="ges-trim">Trimestre
            <select className="campo" value={sel} onChange={(e) => { setSel(Number(e.target.value)); setEnvio(''); }}>
              {trimestres.map((x, i) => <option key={`${x.anio}-${x.t}`} value={i}>{x.t}T {x.anio}</option>)}
            </select>
          </label>
          <div className="ges-botones">
            <button type="button" className="boton" onClick={mandar} disabled={!guardada || !emailListo || envio.startsWith('Preparando')}>Mandar a la gestoría</button>
            <a className="boton sec" href={`/api/paquete?anio=${trimestres[sel].anio}&t=${trimestres[sel].t}`} download>Descargar</a>
          </div>
          {envio && <p role="status" className={envio.startsWith('✓') || envio.startsWith('Preparando') ? 'nota' : 'error'}>{envio}</p>}
        </div>
        <p className="grupo-pie">{!emailListo ? 'El envío por email aún no está configurado: descárgalo y mándaselo tú.' : guardada ? `Le llega a ${gestoria.email} con tu email para responder (si lo has puesto en Datos de la empresa).` : 'Guarda antes el email de tu gestoría.'}</p>
      </section>

      {invitar && (
        <section className="grupo">
          <h2 className="grupo-t">Acceso a Netto</h2>
          <div className="grupo-c">
            <Ir href="/usuarios?invitar=gestoria" className="celda ir"><span className="txt">Invitar a tu gestoría<small>Entra con su propio usuario y ve facturas, gastos, nóminas e impuestos.{!app && ' Una gestoría no cuenta como usuario de tu plan.'}</small></span></Ir>
          </div>
        </section>
      )}
    </>
  );
}
