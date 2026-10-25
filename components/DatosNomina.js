'use client';

import { ADMINISTRADOR, GRUPOS } from '@/lib/nominas';

// Datos de un empleado para la nómina completa (lib/nominas.js): cotización a la Seguridad Social y modelo 145, el que
// el trabajador entrega a la empresa para calcular su retención del IRPF.
const DISCAPACIDAD = [['no', 'Sin discapacidad'], ['33a65', 'Del 33 % al 64 %'], ['65', 'Del 65 % o más']];
const anio = new Date().getFullYear();

export function Cotizacion({ valor, cambiar, parcial = false }) {
  const c = valor || {};
  const poner = (k, v) => cambiar({ ...c, [k]: v });
  return (
    <fieldset className="grupo-campos">
      <legend>Cotización a la Seguridad Social</legend>
      <label>Grupo de cotización
        <select className="campo" value={c.grupo || ''} onChange={(e) => poner('grupo', Number(e.target.value) || '')} required>
          <option value="">Elige el grupo</option>
          {Object.entries(GRUPOS).map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
        </select>
      </label>
      <div className="dos-col">
        <label>Contrato
          <select className="campo" value={c.temporal ? 'temporal' : 'indefinido'} onChange={(e) => poner('temporal', e.target.value === 'temporal')}>
            <option value="indefinido">Indefinido</option>
            <option value="temporal">Temporal (más desempleo)</option>
          </select>
        </label>
        <label>Accidentes de trabajo (%)<input className="campo" inputMode="decimal" value={c.atPct ?? 1.5} onChange={(e) => poner('atPct', e.target.value)} /></label>
      </div>
      {c.temporal && <label className="check"><input type="checkbox" checked={Boolean(c.sustitucion)} onChange={(e) => poner('sustitucion', e.target.checked)} /> Es un contrato de sustitución (sin la cotización adicional de los contratos de menos de 30 días)</label>}
      <label>¿Es consejero o administrador de la sociedad?
        <select className="campo" value={c.administrador || ''} onChange={(e) => poner('administrador', e.target.value || undefined)}>
          <option value="">No, es un trabajador</option>
          {Object.entries(ADMINISTRADOR).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      {c.administrador && <>
        <label className="check"><input type="checkbox" checked={Boolean(c.pequena)} onChange={(e) => poner('pequena', e.target.checked)} /> La sociedad facturó menos de 100.000 € el año pasado (retención del 19 % en vez del 35 %)</label>
        <p className="nota">{c.administrador === 'asimilado' ? 'Cotiza en el régimen general sin desempleo, FOGASA ni formación profesional.' : 'Cotiza él en el RETA: su nómina no lleva Seguridad Social.'} La retención es la de los administradores (art. 101.2 del Reglamento del IRPF), no la del modelo 145, y va en el 190 con la clave E.</p>
      </>}
      <div className="dos-col">
        <label>Pagas extra al año<input className="campo" inputMode="numeric" value={c.pagas ?? 2} onChange={(e) => poner('pagas', e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={c.prorrateadas !== false} onChange={(e) => poner('prorrateadas', e.target.checked)} /> Van prorrateadas en el sueldo de cada mes</label>
      </div>
      {parcial && <p className="nota">A tiempo parcial, la base mínima sale de las horas fichadas del mes en el registro de jornada. Sin fichajes, la base mínima se calcula en proporción a la jornada.</p>}
      <p className="nota">La tarifa de accidentes de trabajo depende de la actividad (la de oficina es el 1,5 %); te la dice tu gestoría o la disposición adicional cuarta de la Ley 42/2006.</p>
    </fieldset>
  );
}

const Persona = ({ p, cambiar, quitar, tipo }) => (
  <div className="persona-145">
    <div className="tres-col">
      <label>Año de nacimiento<input className="campo" inputMode="numeric" value={p.nacimiento ?? ''} onChange={(e) => cambiar({ ...p, nacimiento: Number(e.target.value) || '' })} /></label>
      <label>Discapacidad
        <select className="campo" value={p.discapacidad || 'no'} onChange={(e) => cambiar({ ...p, discapacidad: e.target.value })}>
          {DISCAPACIDAD.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      {tipo === 'hijo'
        ? <label className="check"><input type="checkbox" checked={Boolean(p.porEntero)} onChange={(e) => cambiar({ ...p, porEntero: e.target.checked })} /> Solo conmigo (cuenta por entero)</label>
        : <label>Conviven con él (personas)<input className="campo" inputMode="numeric" value={p.convivencia ?? 1} onChange={(e) => cambiar({ ...p, convivencia: Number(e.target.value) || 1 })} /></label>}
    </div>
    {p.discapacidad === '33a65' && <label className="check"><input type="checkbox" checked={Boolean(p.movilidadReducida)} onChange={(e) => cambiar({ ...p, movilidadReducida: e.target.checked })} /> Necesita ayuda de otra persona o tiene movilidad reducida</label>}
    <button type="button" className="enlace-claro" onClick={quitar}>Quitar</button>
  </div>
);

export function Modelo145({ valor, cambiar }) {
  const d = valor || {};
  const poner = (k, v) => cambiar({ ...d, [k]: v });
  const lista = (k) => d[k] || [];
  const ponerEn = (k, i, v) => poner(k, lista(k).map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="grupo-campos">
      <legend>Retención del IRPF (modelo 145)</legend>
      <p className="nota">Con estos datos Fisquo calcula su tipo de retención con el algoritmo de la Agencia Tributaria. Son los del modelo 145 que el trabajador te entrega firmado (y vuelve a entregar si cambian).</p>
      <label>Situación familiar
        <select className="campo" value={d.situacionFamiliar || 3} onChange={(e) => poner('situacionFamiliar', Number(e.target.value))}>
          <option value={1}>1 · Soltero, viudo, divorciado o separado, con hijos menores de 18 que viven solo con él</option>
          <option value={2}>2 · Casado y su cónyuge no gana más de 1.500 € al año</option>
          <option value={3}>3 · Cualquier otra situación</option>
        </select>
      </label>
      {Number(d.situacionFamiliar) === 2 && <label>NIF del cónyuge<input className="campo" value={d.nifConyuge || ''} onChange={(e) => poner('nifConyuge', e.target.value.toUpperCase())} /></label>}
      <div className="tres-col">
        <label>Año de nacimiento<input className="campo" inputMode="numeric" value={d.nacimiento ?? ''} onChange={(e) => poner('nacimiento', Number(e.target.value) || '')} placeholder="1990" required /></label>
        <label>Discapacidad
          <select className="campo" value={d.discapacidad || 'no'} onChange={(e) => poner('discapacidad', e.target.value)}>
            {DISCAPACIDAD.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label>Contrato (para el IRPF)
          <select className="campo" value={d.contrato || 'general'} onChange={(e) => poner('contrato', e.target.value)}>
            <option value="general">General</option>
            <option value="inferiorAnio">De menos de un año (mínimo 2 %)</option>
            <option value="especial">Relación laboral especial (mínimo 15 %)</option>
          </select>
        </label>
      </div>
      {d.discapacidad === '33a65' && <label className="check"><input type="checkbox" checked={Boolean(d.movilidadReducida)} onChange={(e) => poner('movilidadReducida', e.target.checked)} /> Necesita ayuda de otra persona o tiene movilidad reducida</label>}
      <label className="check"><input type="checkbox" checked={Boolean(d.movilidadGeografica)} onChange={(e) => poner('movilidadGeografica', e.target.checked)} /> Cambió de residencia para aceptar este trabajo (movilidad geográfica)</label>
      <label className="check"><input type="checkbox" checked={Boolean(d.prestamoVivienda)} onChange={(e) => poner('prestamoVivienda', e.target.checked)} /> Paga un préstamo de su vivienda habitual comprada antes de 2013 (y gana menos de 33.007,20 €)</label>
      <div className="dos-col">
        <label>Pensión compensatoria al cónyuge (al año)<input className="campo" inputMode="decimal" value={d.pensionConyuge ?? ''} onChange={(e) => poner('pensionConyuge', Number(String(e.target.value).replace(',', '.')) || 0)} placeholder="0" /></label>
        <label>Anualidades por alimentos a los hijos (al año)<input className="campo" inputMode="decimal" value={d.alimentos ?? ''} onChange={(e) => poner('alimentos', Number(String(e.target.value).replace(',', '.')) || 0)} placeholder="0" /></label>
      </div>
      <p className="rotulo">Hijos menores de 25 años (o con discapacidad) que viven con él</p>
      {lista('descendientes').map((p, i) => <Persona key={i} tipo="hijo" p={p} cambiar={(v) => ponerEn('descendientes', i, v)} quitar={() => poner('descendientes', lista('descendientes').filter((_, j) => j !== i))} />)}
      <button type="button" className="boton sec pequeno" onClick={() => poner('descendientes', [...lista('descendientes'), { nacimiento: anio - 5, discapacidad: 'no', porEntero: false }])}>+ Añadir hijo</button>
      <p className="rotulo">Padres o abuelos mayores de 65 años (o con discapacidad) que viven con él</p>
      {lista('ascendientes').map((p, i) => <Persona key={i} tipo="ascendiente" p={p} cambiar={(v) => ponerEn('ascendientes', i, v)} quitar={() => poner('ascendientes', lista('ascendientes').filter((_, j) => j !== i))} />)}
      <button type="button" className="boton sec pequeno" onClick={() => poner('ascendientes', [...lista('ascendientes'), { nacimiento: anio - 75, discapacidad: 'no', convivencia: 1 }])}>+ Añadir ascendiente</button>
    </fieldset>
  );
}
