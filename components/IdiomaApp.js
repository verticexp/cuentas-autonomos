'use client';

import { useState } from 'react';
import { IDIOMAS_APP } from '@/lib/i18n';
import { useT } from '@/components/Idioma';

// Ajustes › Idioma: el del iPhone o el navegador (automático) o uno fijo. Se guarda en este dispositivo, como la apariencia,
// y en la ficha de la persona (para sus correos y avisos); la app se vuelve a cargar entera para que todo salga ya en el idioma nuevo.
export default function IdiomaApp({ inicial }) {
  const tr = useT();
  const [idioma, setIdioma] = useState(IDIOMAS_APP.some((x) => x.id === inicial) ? inicial : 'automatico');

  async function elegir(valor) {
    if (valor === idioma) return;
    const automatico = valor === 'automatico';
    document.cookie = `idioma=${automatico ? '' : valor}; path=/; max-age=${automatico ? 0 : 31536000}; SameSite=Lax`;
    setIdioma(valor);
    // También en tu ficha, para que los correos y los avisos te lleguen en este idioma. Si falla, la app cambia igual.
    await fetch('/api/idioma', { method: 'POST' }).catch(() => {});
    window.location.reload();
  }

  return (
    <section className="grupo">
      <div className="grupo-c" role="radiogroup" aria-label={tr('Idioma')}>
        {[{ id: 'automatico', nombre: tr('Automático') }, ...IDIOMAS_APP].map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={idioma === x.id} className="celda aj-opcion" onClick={() => elegir(x.id)}
            lang={x.id === 'automatico' ? undefined : x.id}>
            <span className="txt">{x.nombre}{x.id === 'automatico' && <small>{tr('El del iPhone o el navegador')}</small>}</span>
            {idioma === x.id && <svg viewBox="0 0 24 24" aria-hidden className="aj-check"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </button>
        ))}
      </div>
      <p className="grupo-pie">{tr('Se guarda en este dispositivo, y los correos y avisos de Fisquo te llegan en este idioma. Las facturas salen en el idioma de cada cliente, que se elige en su ficha.')}</p>
    </section>
  );
}
