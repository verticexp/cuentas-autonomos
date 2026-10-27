'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';

// «¿Ya lo has presentado?» de un modelo cuyo plazo pasó sin marcarlo (lib/tesoreria.js): lo marca como presentado (el 130,
// también como pagado por su importe) y la tesorería deja de contarlo. Sin el permiso «Contabilidad», solo lo dice.
const CUERPO = {
  420: ({ anio, t }) => ({ presentado303: { anio, t, hecho: true } }),
  303: ({ anio, t }) => ({ presentado303: { anio, t, hecho: true } }),
  130: ({ anio, t }, importe) => ({ presentado: { anio, t, importe } }),
  131: ({ anio, t }, importe) => ({ presentado131: { anio, t, importe } }),
  111: ({ anio, t }) => ({ presentadoRet: { modelo: '111', anio, t, hecho: true } }),
  115: ({ anio, t }) => ({ presentadoRet: { modelo: '115', anio, t, hecho: true } }),
  123: ({ anio, t }) => ({ presentadoRet: { modelo: '123', anio, t, hecho: true } }),
  216: ({ anio, t }) => ({ presentadoRet: { modelo: '216', anio, t, hecho: true } }),
  369: ({ anio, t }) => ({ presentadoRet: { modelo: '369', anio, t, hecho: true } }),
};

export default function YaPresentado({ pregunta, importe, puede }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [ocupado, empezar] = useTransition();
  if (!puede) return <p className="nota">{tr('Lo marca quien tiene el permiso «Contabilidad».')}</p>;
  const marcar = () => empezar(async () => {
    setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(CUERPO[pregunta.modelo](pregunta, importe)) });
      router.refresh();
    } catch (e) { setError(e.message); }
  });
  return (
    <div className="fila-act ya-presentado">
      <button type="button" className="boton sec" onClick={marcar} disabled={ocupado}>{ocupado ? tr('Guardando…') : tr('Sí, ya está presentado')}</button>
      {error && <span className="error" role="alert">{tr(error)}</span>}
    </div>
  );
}
