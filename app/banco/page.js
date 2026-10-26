import { requerir } from '@/lib/auth';
import { headers } from 'next/headers';
import { esApp } from '@/lib/app';
import { SOLO_LECTURA_APP } from '@/lib/planes';
import { leer, mismoId } from '@/lib/redis';
import { candidatosConciliacion } from '@/lib/bancoServidor';
import { documentos, unir } from '@/lib/indices';
import { CLASES, clasesPara, clasificar, opciones, sugerencias } from '@/lib/banco';
import { fiscalDe } from '@/lib/empresa';
import { esSociedad } from '@/lib/modulos';
import { conectarVisible } from '@/lib/enableBanking';
import { importes, numeroFactura } from '@/lib/calculos';
import { totalDe } from '@/lib/proveedores';
import { gastosQueVe, veSueldos } from '@/lib/nominas';
import { DETALLE, puede } from '@/lib/permisos';
import { historialBanco } from '@/lib/historialBanco';
import { aplicarReglas, conReglas, ordenar, resumenRegla } from '@/lib/reglasBanco';
import { eur } from '@/lib/formato';
import Volver from '@/components/Volver';
import SinBD from '@/components/SinBD';
import Banco from '@/components/Banco';
import '@/app/banco.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

const ERRORES = {
  caducado: 'La conexión ha caducado. Vuelve a empezar.',
  cancelado: 'No se ha dado permiso en el banco.',
  bloqueada: 'Fisquo estaba bloqueado al volver del banco. Desbloquéalo y vuelve a conectar.',
  'solo-lectura': 'Tu prueba ha terminado: elige un plan en Ajustes › Tu plan para conectar el banco.',
  banco: 'El banco no ha respondido. Prueba otra vez en un rato.',
  sincuentas: 'El banco no ha compartido ninguna cuenta.',
};

export default async function PaginaBanco({ searchParams }) {
  const u = await requerir(DETALLE);
  const [movs, cuentas, reglasGuardadas] = await Promise.all([leer(u, 'banco'), leer(u, 'bancos'), leer(u, 'bancoReglas')]);
  if (!movs) return <SinBD />;
  const q = await searchParams;
  const lista = movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  const historial = historialBanco(lista, q);
  // Solo las facturas y gastos que pueden casar, más los ya enlazados que se enseñan (informe de capacidad E01).
  const { facturas, gastos } = await candidatosConciliacion(u, lista);
  const emparejadosVisibles = historial.grupos.emparejados.items;
  const enlazados = (tipo) => emparejadosVisibles.filter((m) => m.enlace?.tipo === tipo).map((m) => m.enlace.id);
  const [fEnl, gEnl] = await Promise.all([documentos(u, 'facturas', enlazados('factura')), documentos(u, 'gastos', enlazados('gasto'))]);
  // Las reglas del banco (lib/reglasBanco.js): las de gasto prestan su proveedor al cargo para que sugerencias lo empareje; las de
  // ignorar se enseñan aparte, como propuesta de apartar el movimiento.
  const reglas = ordenar(reglasGuardadas || []);
  const sug = sugerencias(conReglas(lista, reglas), facturas, gastos, u);
  const delMovimiento = aplicarReglas(lista, reglas);
  const frase = (r) => r && { id: r.id, accion: r.accion, contiene: r.contiene, proveedor: r.proveedor, ...resumenRegla(r, eur) };
  const usos = new Map();
  for (const m of lista) if (m.regla) usos.set(m.regla, (usos.get(m.regla) || 0) + 1);
  const listaReglas = [...reglas].sort((a, b) => String(a.creada || '').localeCompare(String(b.creada || '')))
    .map((r) => ({ id: r.id, accion: r.accion, signo: r.signo, contiene: r.contiene, min: r.min, max: r.max, proveedor: r.proveedor, categoria: r.categoria, ...resumenRegla(r, eur), usos: usos.get(r.id) || 0 }));
  const fPorId = Object.fromEntries(unir(facturas, fEnl).map((f) => [f.id, f]));
  const gPorId = Object.fromEntries(gastosQueVe(u, unir(gastos, gEnl)).filter((g) => !g.agrupado).map((g) => [g.id, g]));
  const sociedad = esSociedad(fiscalDe(u));
  // Lo que se enseña de cada factura o gasto enlazado o sugerido.
  const destino = (tipo, id) => {
    // El autónomo no tiene libro diario (lib/modulos.js): sus impuestos, a Impuestos; lo demás, a sus libros.
    if (tipo === 'auto') return { tipo, id, texto: `${CLASES[id]?.t || 'Impuestos o nóminas'} · lo contabiliza Fisquo`, url: sociedad ? '/contabilidad?ver=diario' : '/modelos' };
    if (tipo === 'asiento') return { tipo, id, texto: 'Apuntado en la contabilidad', url: sociedad ? '/contabilidad?ver=diario' : '/contabilidad?ver=libros' };
    if (tipo === 'factura') { const f = fPorId[id]; return f && { tipo, id, texto: `Factura ${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe: importes(f).total, fecha: f.fecha, url: `/facturas/${encodeURIComponent(id)}` }; }
    const g = gPorId[id];
    return g && { tipo, id, texto: `${g.proveedor ? `${g.proveedor} · ` : ''}${g.concepto}`, importe: totalDe(g), fecha: g.fecha, url: `/gastos/${encodeURIComponent(id)}`, pendiente: Boolean(g.pendiente) };
  };
  const pendientes = historial.grupos.pendientes.items.map((m) => ({
    ...m, sugerencia: sug[m.id] ? { ...destino(sug[m.id].tipo, sug[m.id].id), segura: sug[m.id].segura, motivo: sug[m.id].motivo, yaCobrada: Boolean(sug[m.id].yaCobrada), importeSug: sug[m.id].importe } : null,
    regla: frase(delMovimiento.gasto.get(m.id) || delMovimiento.ignorar.get(m.id)) || null,
    opciones: opciones(m, facturas, gastos, lista, u),
    clase: clasificar(m, { autonomo: fiscalDe(u).tipo === 'autonomo' }), clases: clasesPara(m),
  }));
  const emparejados = emparejadosVisibles.map((m) => (m.enlace.tipo === 'gasto' && !veSueldos(u) && gEnl.some((g) => g.nomina && mismoId(g.id, m.enlace.id))
    ? { ...m, enlace: { tipo: 'auto', id: 'nomina' }, antes: undefined, destino: destino('auto', 'nomina') }
    : { ...m, destino: destino(m.enlace.tipo, m.enlace.id) }));
  const automaticos = emparejadosVisibles.filter((m) => m.auto).length;
  const ignorados = historial.grupos.ignorados.items;
  const cuentasFiltro = new Map((cuentas || []).map((c) => [c.id, c.nombre]));
  for (const m of lista) if (m.cuenta && !cuentasFiltro.has(m.cuenta)) cuentasFiltro.set(m.cuenta, `Cuenta anterior (${m.cuenta.slice(-6)})`);
  // La conexión directa es solo del administrador de Fisquo: al resto ni se le habla de ella, aunque traiga ?conectado o ?error.
  const directo = conectarVisible(u);
  const n = directo ? Number(q.conectado) || 0 : 0;
  const app = esApp((await headers()).get('user-agent'));
  const aviso = directo && q.error ? { error: true, texto: app && q.error === 'solo-lectura' ? SOLO_LECTURA_APP : ERRORES[q.error] || 'No se ha podido conectar el banco. Inténtalo de nuevo en unos minutos.' } : n ? { texto: n === 1 ? '✓ Cuenta conectada' : `✓ ${n} cuentas conectadas` } : null;

  return (
    <main className="pagina mk-look banco">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">Banco</h1>
      <Banco
        cuentas={(cuentas || []).sort((a, b) => (a.conectada || a.subido || '').localeCompare(b.conectada || b.subido || ''))}
        pendientes={pendientes} emparejados={emparejados} ignorados={ignorados} automaticos={automaticos} aviso={aviso}
        historial={{ ...historial, grupos: Object.fromEntries(Object.entries(historial.grupos).map(([k, { items, ...p }]) => [k, p])) }}
        cuentasFiltro={[...cuentasFiltro].map(([id, nombre]) => ({ id, nombre }))} reglas={listaReglas}
        listo={directo} permisos={{ facturar: puede(u, 'facturar'), gastar: puede(u, 'gastar'), empresa: puede(u, 'empresa') }}
      />
    </main>
  );
}

export const metadata = { title: 'Banco' };
