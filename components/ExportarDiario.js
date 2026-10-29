'use client';
import { useState } from 'react';
import { useT } from '@/components/Idioma';

// El libro diario del año para el programa de la gestoría (lib/exportarContable.js). base: la ruta de la API, con su
// ?empresa= si es la de Mi despacho. Las subcuentas tienen que llevar los mismos dígitos que en el programa de destino.
export default function ExportarDiario({ base, anios }) {
  const tr = useT();
  const [formato, setFormato] = useState('a3');
  const [anio, setAnio] = useState(anios[0]);
  const [digitos, setDigitos] = useState(8);
  const [codigo, setCodigo] = useState('1');
  const max = formato === 'contasol' ? 10 : 12;
  const d = Math.min(digitos, max);
  const href = `${base}${base.includes('?') ? '&' : '?'}formato=${formato}&anio=${anio}&digitos=${d}${formato === 'a3' ? `&codigo=${codigo || 1}` : ''}`;
  return (
    <div className="exportar-diario">
      <label>{tr('Programa')}<select className="campo" value={formato} onChange={(e) => setFormato(e.target.value)}><option value="a3">A3</option><option value="contaplus">ContaPlus</option><option value="contasol">ContaSol</option></select></label>
      {anios.length > 1 && <label>{tr('Año')}<select className="campo" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{anios.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>}
      <label>{tr('Dígitos de subcuenta')}<select className="campo" value={d} onChange={(e) => setDigitos(Number(e.target.value))}>{Array.from({ length: max - 5 }, (_, i) => i + 6).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      {formato === 'a3' && <label>{tr('Código en A3')}<input className="campo" inputMode="numeric" maxLength={5} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} /></label>}
      <a className="boton sec" href={href} download>{tr('Exportar')}</a>
    </div>
  );
}
