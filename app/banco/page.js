import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { opciones, sugerencias } from '@/lib/banco';
import { bancoListo } from '@/lib/enableBanking';
import { importes, numeroFactura } from '@/lib/calculos';
import { totalDe } from '@/lib/proveedores';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import SinBD from '@/components/SinBD';
import Banco from '@/components/Banco';
import '@/app/banco.css';

export const dynamic = 'force-dynamic';

const ERRORES = {
  caducado: 'La conexión ha caducado. Vuelve a empezar.',
  cancelado: 'No se ha dado permiso en el banco.',
  banco: 'El banco no ha respondido. Prueba otra vez en un rato.',
  sincuentas: 'El banco no ha compartido ninguna cuenta.',
};

export default async function PaginaBanco({ searchParams }) {
  const u = await requerir('resumen');
  const [movs, cuentas, facturas, gastos] = await Promise.all([leer(u, 'banco'), leer(u, 'bancos'), leer(u, 'facturas'), leer(u, 'gastos')]);
  if (!facturas) return <SinBD />;
  const q = await searchParams;
  const lista = (movs || []).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  const sug = sugerencias(lista, facturas, gastos || []);
  const fPorId = Object.fromEntries(facturas.map((f) => [f.id, f]));
  const gPorId = Object.fromEntries((gastos || []).map((g) => [g.id, g]));
  // Lo que se enseña de cada factura o gasto enlazado o sugerido.
  const destino = (tipo, id) => {
    if (tipo === 'factura') { const f = fPorId[id]; return f && { tipo, id, texto: `Factura ${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe: importes(f).total, fecha: f.fecha, url: `/facturas/${encodeURIComponent(id)}` }; }
    const g = gPorId[id];
    return g && { tipo, id, texto: `${g.proveedor ? `${g.proveedor} · ` : ''}${g.concepto}`, importe: totalDe(g), fecha: g.fecha, url: `/gastos/${encodeURIComponent(id)}`, pendiente: Boolean(g.pendiente) };
  };
  const pendientes = lista.filter((m) => m.estado === 'pendiente' || !m.estado).slice(0, 150).map((m) => ({
    ...m, sugerencia: sug[m.id] ? { ...destino(sug[m.id].tipo, sug[m.id].id), segura: sug[m.id].segura } : null,
    opciones: opciones(m, facturas, gastos || [], lista),
  }));
  const emparejados = lista.filter((m) => m.estado === 'emparejado').slice(0, 40).map((m) => ({ ...m, destino: destino(m.enlace.tipo, m.enlace.id) }));
  const ignorados = lista.filter((m) => m.estado === 'ignorado').slice(0, 40);
  const n = Number(q.conectado) || 0;
  const aviso = q.error ? { error: true, texto: ERRORES[q.error] || 'No se pudo conectar el banco.' } : n ? { texto: n === 1 ? '✓ Cuenta conectada' : `✓ ${n} cuentas conectadas` } : null;

  return (
    <main className="pagina banco">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">Banco</h1>
      <Banco
        cuentas={(cuentas || []).sort((a, b) => (a.conectada || a.subido || '').localeCompare(b.conectada || b.subido || ''))}
        pendientes={pendientes} emparejados={emparejados} ignorados={ignorados} aviso={aviso}
        listo={bancoListo()} permisos={{ facturar: puede(u, 'facturar'), gastar: puede(u, 'gastar'), empresa: puede(u, 'empresa') }}
      />
    </main>
  );
}
