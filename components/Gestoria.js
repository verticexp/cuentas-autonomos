'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Ir from '@/components/Ir';
import { llamar } from './Acciones';
import useEnvio from './useEnvio';
import { useT } from '@/components/Idioma';

// Ajustes › Tu gestoría. gestoria: { nombre, email, auto } o null. trimestres: [{ anio, t }] del más reciente al más
// antiguo (el primero, el último cerrado). invitar: si puede dar acceso a Fisquo (Usuarios). emailListo: si hay correo.
export default function Gestoria({ gestoria, trimestres, invitar, emailListo, app = false }) {
  const tr = useT();
  const [enviando, envolver] = useEnvio();
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
      <form className="formulario aj-form" onSubmit={envolver(guardar)}>
        <h3 aria-level={2}>{tr('Datos de tu gestoría')}</h3>
        <div className="aj-grupo">
          <label>{tr('Nombre (opcional)')}<input className="campo" value={d.nombre} maxLength={120} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder={tr('Gestoría López')} /></label>
          <label>{tr('Email')}<input autoComplete="email" className="campo" type="email" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="tu@gestoria.es" /></label>
          <label className="check ges-auto"><input type="checkbox" checked={d.auto} onChange={(e) => setD({ ...d, auto: e.target.checked })} disabled={!emailListo} aria-describedby={!emailListo ? "ges-email-ayuda" : undefined} />
            <span>{tr('Mandarle el paquete solo al acabar cada trimestre')}<small>{tr('El día 5 de enero, abril, julio y octubre: facturas, gastos con sus justificantes, nóminas e impuestos del trimestre.')}</small></span></label>
          {!emailListo && <p id="ges-email-ayuda" className="nota">{tr('El envío automático necesita que esté configurado el correo de Fisquo.')}</p>}
        </div>
        {msg && <p role="status" className={msg === 'Guardado' ? 'nota aj-pie guardado' : msg === 'Guardando…' ? 'nota aj-pie' : 'error aj-pie'}>{msg === 'Guardado' ? tr('✓ Guardado') : tr(msg)}</p>}
        <button className="boton" disabled={enviando}>{tr('Guardar')}</button>
      </form>

      <section className="grupo">
        <h2 className="grupo-t">{tr('Mandar el paquete ahora')}</h2>
        <div className="grupo-c relleno">
          <label className="ges-trim">{tr('Trimestre')}
            <select className="campo" value={sel} onChange={(e) => { setSel(Number(e.target.value)); setEnvio(''); }}>
              {trimestres.map((x, i) => <option key={`${x.anio}-${x.t}`} value={i}>{tr('{t}T {anio}', { t: x.t, anio: x.anio })}</option>)}
            </select>
          </label>
          <div className="ges-botones">
            <button type="button" className="boton" onClick={mandar} aria-describedby="ges-envio-ayuda" disabled={!guardada || !emailListo || envio.startsWith('Preparando')}>{tr('Mandar a la gestoría')}</button>
            <a className="boton sec" href={`/api/paquete?anio=${trimestres[sel].anio}&t=${trimestres[sel].t}`} download>{tr('Descargar')}</a>
          </div>
          {envio && <p role="status" className={envio.startsWith('✓') || envio.startsWith('Preparando') ? 'nota' : 'error'}>{tr(envio)}</p>}
        </div>
        <p id="ges-envio-ayuda" className="grupo-pie">{!emailListo ? tr('El envío por email aún no está configurado: descárgalo y mándaselo tú.') : guardada ? tr('Le llega a {email} con tu email para responder (si lo has puesto en Datos de la empresa).', { email: gestoria.email }) : tr('Guarda antes el email de tu gestoría.')}</p>
      </section>

      {invitar && (
        <section className="grupo">
          <h2 className="grupo-t">{tr('Acceso a Fisquo')}</h2>
          <div className="grupo-c">
            <Ir href="/usuarios?invitar=gestoria" className="celda ir"><span className="txt">{tr('Invitar a tu gestoría')}<small>{tr('Entra con su propio usuario y ve facturas, gastos, nóminas e impuestos.')}{!app && ` ${tr('Una gestoría no cuenta como usuario de tu plan.')}`}</small></span></Ir>
          </div>
        </section>
      )}
    </>
  );
}
