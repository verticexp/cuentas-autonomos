'use client';

import { useId, useState } from 'react';
import { AVISO_MENUS, BANCOS_EXTRACTO, CONSEJOS_EXTRACTO, FORMATOS_EXTRACTO, LIMITES_EXTRACTO } from './guiaExtractoDatos';

// «¿Cómo descargo el extracto de mi banco?», junto a la importación de Banco: qué palabra buscar y dónde suele estar en cada banco.
export default function GuiaExtracto() {
  const [banco, setBanco] = useState('');
  const id = useId();
  const b = BANCOS_EXTRACTO.find((x) => x.id === banco);
  return (
    <details className="bco-guia">
      <summary>¿Cómo descargo el extracto de mi banco?</summary>
      <div className="bco-guia-cuerpo">
        <p className="bco-nota">Fisquo lee estos formatos. {LIMITES_EXTRACTO}</p>
        <ul className="bco-guia-formatos">
          {FORMATOS_EXTRACTO.map(([f, d]) => <li key={f}><b>{f}</b>: {d}.</li>)}
        </ul>
        <label className="bco-guia-elegir" htmlFor={`${id}-banco`}>Elige tu banco
          <select id={`${id}-banco`} className="campo" value={banco} onChange={(e) => setBanco(e.target.value)}>
            <option value="">Elige tu banco…</option>
            {BANCOS_EXTRACTO.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        {b && (
          <dl className="bco-guia-banco" aria-live="polite">
            <dt>Dónde suele estar</dt><dd>{b.donde}</dd>
            <dt>Qué buscar</dt><dd>{b.buscar}</dd>
            <dt>Qué formato elegir</dt><dd>{b.formato}</dd>
          </dl>
        )}
        <ul className="bco-guia-consejos">
          {CONSEJOS_EXTRACTO.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <p className="bco-nota">{AVISO_MENUS}</p>
      </div>
    </details>
  );
}
