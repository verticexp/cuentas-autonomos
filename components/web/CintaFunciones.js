'use client';

import { useState } from 'react';

export default function CintaFunciones({ items }) {
  const [pausa, setPausa] = useState(false);
  return (
    <div className="web-cinta-contenedor">
      <div className="web-cinta" aria-label="Qué incluye Fisquo">
        <div className="web-cinta-pista" style={{ animationPlayState: pausa ? 'paused' : undefined }}>
          {[...items, ...items].map((x, i) => <span key={i} aria-hidden={i >= items.length}>{x}</span>)}
        </div>
      </div>
      <button type="button" className="web-cinta-pausa" aria-label={pausa ? 'Reanudar cinta de funciones' : 'Pausar cinta de funciones'} onClick={() => setPausa(!pausa)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={pausa ? 'm9 5 10 7-10 7z' : 'M8 5v14M16 5v14'} /></svg>
      </button>
    </div>
  );
}
