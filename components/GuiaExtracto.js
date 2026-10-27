'use client';

import { useId, useState } from 'react';
import { useT } from '@/components/Idioma';
import { AVISO_MENUS, BANCOS_EXTRACTO, CONSEJOS_EXTRACTO, FORMATOS_EXTRACTO, LIMITES_EXTRACTO } from './guiaExtractoDatos';

// «¿Cómo descargo el extracto de mi banco?», junto a la importación de Banco: qué palabra buscar y dónde suele estar en cada banco.
export default function GuiaExtracto() {
  const tr = useT();
  const [banco, setBanco] = useState('');
  const id = useId();
  const b = BANCOS_EXTRACTO.find((x) => x.id === banco);
  return (
    <details className="bco-guia">
      <summary>{tr('¿Cómo descargo el extracto de mi banco?')}</summary>
      <div className="bco-guia-cuerpo">
        <p className="bco-nota">{tr('Fisquo lee estos formatos.')} {tr(LIMITES_EXTRACTO)}</p>
        <ul className="bco-guia-formatos">
          {FORMATOS_EXTRACTO.map(([f, d]) => <li key={f}><b>{tr(f)}</b>: {tr(d)}.</li>)}
        </ul>
        <label className="bco-guia-elegir" htmlFor={`${id}-banco`}>{tr('Elige tu banco')}
          <select id={`${id}-banco`} className="campo" value={banco} onChange={(e) => setBanco(e.target.value)}>
            <option value="">{tr('Elige tu banco…')}</option>
            {BANCOS_EXTRACTO.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        {b && (
          <dl className="bco-guia-banco" aria-live="polite">
            <dt>{tr('Dónde suele estar')}</dt><dd>{tr(b.donde)}</dd>
            <dt>{tr('Qué buscar')}</dt><dd>{tr(b.buscar)}</dd>
            <dt>{tr('Qué formato elegir')}</dt><dd>{tr(b.formato)}</dd>
          </dl>
        )}
        <ul className="bco-guia-consejos">
          {CONSEJOS_EXTRACTO.map((c) => <li key={c}>{tr(c)}</li>)}
        </ul>
        <p className="bco-nota">{tr(AVISO_MENUS)}</p>
      </div>
    </details>
  );
}
