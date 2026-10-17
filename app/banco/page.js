import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { candidatosConciliacion } from '@/lib/bancoServidor';
import { documentos, unir } from '@/lib/indices';
import { CLASES, clasesPara, clasificar, opciones, sugerencias } from '@/lib/banco';
import { fiscalDe } from '@/lib/empresa';
import { conectarVisible } from '@/lib/enableBanking';
import { importes, numeroFactura } from '@/lib/calculos';
import { totalDe } from '@/lib/proveedores';
import { puede } from '@/lib/permisos';
import { historialBanco } from '@/lib/historialBanco';
import Volver from '@/components/Volver';
import SinBD from '@/components/SinBD';
import Banco from '@/components/Banco';
import '@/app/banco.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

const ERRORES = {
  caducado: 'La conexión ha caducado. Vuelve a empezar.',
  cancelado: 'No se ha dado permiso en el banco.',
  banco: 'El banco no ha respondido. Prueba otra vez en un rato.',
  sincuentas: 'El banco no ha compartido ninguna cuenta.',
};

export default async function PaginaBanco({ searchParams }) {
  const u = await requerir('resumen');
  const [movs, cuentas] = await Promise.all([leer(u, 'banco'), leer(u, 'bancos')]);
  if (!movs) return <SinBD />;
  const q = await searchParams;
  const lista = movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  const historial = historialBanco(lista, q);
  // Solo las facturas y gastos que pueden casar, más los ya enlazados que se enseñan (informe de capacidad E01).
  const { facturas, gastos } = await candidatosConciliacion(u, lista);
  const emparejadosVisibles = historial.grupos.emparejados.items;
  const enlazados = (tipo) => emparejadosVisibles.filter((m) => m.enlace?.tipo === tipo).map((m) => m.enlace.id);
  const [fEnl, gEnl] = await Promise.all([documentos(u, 'facturas', enlazados('factura')), documentos(u, 'gastos', enlazados('gasto'))]);
  const sug = sugerencias(lista, facturas, gastos);
  const fPorId = Object.fromEntries(unir(facturas, fEnl).map((f) => [f.id, f]));
  const gPorId = Object.fromEntries(unir(gastos, gEnl).map((g) => [g.id, g]));
  // Lo que se enseña de cada factura o gasto enlazado o sugerido.
  const destino = (tipo, id) => {
    if (tipo === 'auto') return { tipo, id, texto: `${CLASES[id]?.t || 'Impuestos o nóminas'} · lo contabiliza Netto`, url: '/contabilidad?ver=diario' };
    if (tipo === 'asiento') return { tipo, id, texto: 'Apuntado en la contabilidad', url: '/contabilidad?ver=diario' };
    if (tipo === 'factura') { const f = fPorId[id]; return f && { tipo, id, texto: `Factura ${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe: importes(f).total, fecha: f.fecha, url: `/facturas/${encodeURIComponent(id)}` }; }
    const g = gPorId[id];
    return g && { tipo, id, texto: `${g.proveedor ? `${g.proveedor} · ` : ''}${g.concepto}`, importe: totalDe(g), fecha: g.fecha, url: `/gastos/${encodeURIComponent(id)}`, pendiente: Boolean(g.pendiente) };
  };
  const pendientes = historial.grupos.pendientes.items.map((m) => ({
    ...m, sugerencia: sug[m.id] ? { ...destino(sug[m.id].tipo, sug[m.id].id), segura: sug[m.id].segura, motivo: sug[m.id].motivo, yaCobrada: Boolean(sug[m.id].yaCobrada), importeSug: sug[m.id].importe } : null,
    opciones: opciones(m, facturas, gastos, lista),
    clase: clasificar(m, { autonomo: fiscalDe(u).tipo === 'autonomo' }), clases: clasesPara(m),
  }));
  const emparejados = emparejadosVisibles.map((m) => ({ ...m, destino: destino(m.enlace.tipo, m.enlace.id) }));
  const automaticos = emparejadosVisibles.filter((m) => m.auto).length;
  const ignorados = historial.grupos.ignorados.items;
  const cuentasFiltro = new Map((cuentas || []).map((c) => [c.id, c.nombre]));
  for (const m of lista) if (m.cuenta && !cuentasFiltro.has(m.cuenta)) cuentasFiltro.set(m.cuenta, `Cuenta anterior (${m.cuenta.slice(-6)})`);
  const n = Number(q.conectado) || 0;
  const aviso = q.error ? { error: true, texto: ERRORES[q.error] || 'No se pudo conectar el banco.' } : n ? { texto: n === 1 ? '✓ Cuenta conectada' : `✓ ${n} cuentas conectadas` } : null;

  return (
    <main className="pagina mk-look banco">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">Banco</h1>
      <Banco
        cuentas={(cuentas || []).sort((a, b) => (a.conectada || a.subido || '').localeCompare(b.conectada || b.subido || ''))}
        pendientes={pendientes} emparejados={emparejados} ignorados={ignorados} automaticos={automaticos} aviso={aviso}
        historial={{ ...historial, grupos: Object.fromEntries(Object.entries(historial.grupos).map(([k, { items, ...p }]) => [k, p])) }}
        cuentasFiltro={[...cuentasFiltro].map(([id, nombre]) => ({ id, nombre }))}
        listo={conectarVisible(u)} permisos={{ facturar: puede(u, 'facturar'), gastar: puede(u, 'gastar'), empresa: puede(u, 'empresa') }}
      />
    </main>
  );
}
