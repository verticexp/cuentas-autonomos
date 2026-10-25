'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPCIONES = [['automatico', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];

export default function Apariencia({ inicial }) {
  const router = useRouter();
  const [tema, setTema] = useState(inicial === 'claro' || inicial === 'oscuro' ? inicial : 'automatico');

  function elegir(valor) {
    const automatico = valor === 'automatico';
    document.cookie = `tema=${automatico ? '' : valor}; path=/; max-age=${automatico ? 0 : 31536000}; SameSite=Lax`;
    if (automatico) delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = valor;
    setTema(valor);
    window.dispatchEvent(new Event('fisquo-tema'));
    router.refresh(); // la lista de Ajustes enseña el tema elegido en su fila: se vuelve a pedir con la cookie nueva
  }

  return (
    <div>
      <div className="segmentado apariencia" role="group" aria-label="Apariencia">
        {OPCIONES.map(([valor, etiqueta]) => (
          <button key={valor} type="button" className={tema === valor ? 'activo' : undefined}
            aria-pressed={tema === valor} onClick={() => elegir(valor)}>{etiqueta}</button>
        ))}
      </div>
      <p className="nota">Se guarda en este dispositivo.</p>
    </div>
  );
}
