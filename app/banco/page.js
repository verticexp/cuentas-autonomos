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
import { aplicarReglas, conReglas, ordenar } from '@/lib/reglasBanco';
import { CATEGORIAS } from '@/lib/categorias';
import { eur } from '@/lib/formato';
import { textos } from '@/lib/idiomaServidor';
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

// La frase de una regla en el idioma de la persona (lib/reglasBanco.js resumenRegla la da en castellano): cada frase va entera.
const CUANDO = {
  cargo: ['Si un cargo contiene «{texto}»', 'Si un cargo contiene «{texto}», de {desde} a {hasta}', 'Si un cargo contiene «{texto}», desde {desde}', 'Si un cargo contiene «{texto}», hasta {hasta}'],
  abono: ['Si un abono contiene «{texto}»', 'Si un abono contiene «{texto}», de {desde} a {hasta}', 'Si un abono contiene «{texto}», desde {desde}', 'Si un abono contiene «{texto}», hasta {hasta}'],
  ambos: ['Si un movimiento contiene «{texto}»', 'Si un movimiento contiene «{texto}», de {desde} a {hasta}', 'Si un movimiento contiene «{texto}», desde {desde}', 'Si un movimiento contiene «{texto}», hasta {hasta}'],
};
function fraseRegla(r, tr) {
  const i = r.min != null && r.max != null ? 1 : r.min != null ? 2 : r.max != null ? 3 : 0;
  const cuando = tr(CUANDO[r.signo === 'cargo' || r.signo === 'abono' ? r.signo : 'ambos'][i], { texto: r.contiene, desde: r.min != null ? eur(r.min) : '', hasta: r.max != null ? eur(r.max) : '' });
  const cat = r.categoria && CATEGORIAS.find((c) => c.id === r.categoria)?.nombre;
  const entonces = r.accion === 'gasto' ? (cat ? tr('es un gasto de {proveedor} ({categoria})', { proveedor: r.proveedor, categoria: tr(cat) }) : tr('es un gasto de {proveedor}', { proveedor: r.proveedor })) : tr('se ignora');
  return { cuando, entonces };
}

export default async function PaginaBanco({ searchParams }) {
  const tr = await textos();
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
  const frase = (r) => r && { id: r.id, accion: r.accion, contiene: r.contiene, proveedor: r.proveedor, ...fraseRegla(r, tr) };
  const usos = new Map();
  for (const m of lista) if (m.regla) usos.set(m.regla, (usos.get(m.regla) || 0) + 1);
  const listaReglas = [...reglas].sort((a, b) => String(a.creada || '').localeCompare(String(b.creada || '')))
    .map((r) => ({ id: r.id, accion: r.accion, signo: r.signo, contiene: r.contiene, min: r.min, max: r.max, proveedor: r.proveedor, categoria: r.categoria, ...fraseRegla(r, tr), usos: usos.get(r.id) || 0 }));
  const fPorId = Object.fromEntries(unir(facturas, fEnl).map((f) => [f.id, f]));
  const gPorId = Object.fromEntries(gastosQueVe(u, unir(gastos, gEnl)).filter((g) => !g.agrupado).map((g) => [g.id, g]));
  const sociedad = esSociedad(fiscalDe(u));
  // Lo que se enseña de cada factura o gasto enlazado o sugerido.
  const destino = (tipo, id) => {
    // El autónomo no tiene libro diario (lib/modulos.js): sus impuestos, a Impuestos; lo demás, a sus libros.
    if (tipo === 'auto') return { tipo, id, texto: tr('{clase} · lo contabiliza Fisquo', { clase: tr(CLASES[id]?.t || 'Impuestos o nóminas') }), url: sociedad ? '/contabilidad?ver=diario' : '/modelos' };
    if (tipo === 'tpv') return { tipo, id, texto: tr('Tarjeta de los cierres de caja · comisión en Gastos'), url: '/facturas/caja?ver=tarjeta' };
    if (tipo === 'asiento') return { tipo, id, texto: tr('Apuntado en la contabilidad'), url: sociedad ? '/contabilidad?ver=diario' : '/contabilidad?ver=libros' };
    if (tipo === 'factura') { const f = fPorId[id]; return f && { tipo, id, texto: tr('Factura {numero} · {cliente}', { numero: numeroFactura(f), cliente: f.cliente?.nombre || '' }), importe: importes(f).total, fecha: f.fecha, url: `/facturas/${encodeURIComponent(id)}` }; }
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
  for (const m of lista) if (m.cuenta && !cuentasFiltro.has(m.cuenta)) cuentasFiltro.set(m.cuenta, tr('Cuenta anterior ({fin})', { fin: m.cuenta.slice(-6) }));
  // La conexión directa es solo del administrador de Fisquo: al resto ni se le habla de ella, aunque traiga ?conectado o ?error.
  const directo = conectarVisible(u);
  const n = directo ? Number(q.conectado) || 0 : 0;
  const app = esApp((await headers()).get('user-agent'));
  const aviso = directo && q.error ? { error: true, texto: app && q.error === 'solo-lectura' ? SOLO_LECTURA_APP : ERRORES[q.error] || 'No se ha podido conectar el banco. Inténtalo de nuevo en unos minutos.' } : n ? { texto: n === 1 ? '✓ Cuenta conectada' : `✓ ${n} cuentas conectadas` } : null;

  return (
    <main className="pagina mk-look banco">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">{tr('Banco')}</h1>
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

export async function generateMetadata() { return { title: (await textos())('Banco') }; }
