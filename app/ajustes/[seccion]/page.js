import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { esApp } from '@/lib/app';
import { perderia, planQueLoIncluye } from '@/lib/planes';
import { genteDe, usoDe } from '@/lib/usoPlan';
import { estadoVerifactu } from '@/lib/verifactuEstado';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { DETALLE, puede } from '@/lib/permisos';
import Ajustes from '@/components/Ajustes';
import Controlat from '@/components/Controlat';
import Marca from '@/components/Marca';
import FaceId from '@/components/FaceId';
import DosPasos from '@/components/DosPasos';
import AccesosRecientes from '@/components/AccesosRecientes';
import { accesosDe } from '@/lib/accesos';
import { diaDe } from '@/lib/formato';
import ElegirPlan from '@/components/ElegirPlan';
import estilosPlan from '@/components/ElegirPlan.module.css';
import AvisosPush from '@/components/AvisosPush';
import { pushListo } from '@/lib/push';
import Volver from '@/components/Volver';
import SinAcceso from '@/components/SinAcceso';
import Verifactu from '@/components/Verifactu';
import { certificadoListo } from '@/lib/verifactuEnvio';
import { leer } from '@/lib/redis';
import Importar from '@/components/Importar';
import { origenValido } from '@/lib/importarOrigen';
import { actividadesDe, fiscalDe, serieSimplificada } from '@/lib/empresa';
import { numeroPrevisto } from '@/lib/facturas';
import { todasFichas } from '@/lib/indices';
import { SERIE_CAJA } from '@/lib/caja';
import { emailListo } from '@/lib/email';
import { trimestreAnterior } from '@/lib/gestoriaEnvio';
import TuDespacho from '@/components/TuDespacho';
import { leerAccesos } from '@/lib/despachos';
import { comentariosDe, leidoDe, mensajesDe, noLeidos } from '@/lib/comentariosDespacho';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import { ahoraMadrid } from '@/lib/jornada';
import { CONTACTO } from '@/components/web/datos';
import Series from '@/components/Series';
import Gestoria from '@/components/Gestoria';
import StripeConnect from '@/components/StripeConnect';
import { stripeListo } from '@/lib/stripe';
import AjustesApi from '@/components/AjustesApi';
import { alcancesDe, clavesDe } from '@/lib/apiPublica';
import { webhooksDe } from '@/lib/webhooks';
import Apariencia from '@/components/Apariencia';
import Ayuda from '@/components/Ayuda';
import EmailEnvio from '@/components/EmailEnvio';
import '@/app/ajustes.css';

import '@/app/mk.css';
import { esFundador } from '@/lib/prueba';
import { resumenRecomendaciones } from '@/lib/recomendaciones';
import { WEB } from '@/lib/web';
import Recomienda from '@/components/Recomienda';
import { documentos } from '@/lib/indices';

export const dynamic = 'force-dynamic';

const TITULOS = {
  perfil: 'Tu perfil', facturacion: 'Datos de la empresa', marca: 'Diseño de factura', series: 'Series y numeración', cobros: 'Cobros', envio: 'Email de envío', gestoria: 'Tu gestoría',
  seguridad: 'Seguridad', drive: 'Google Drive', controlat: "Controla'T", avisos: 'Avisos', importar: 'Importar datos',
  verifactu: 'Verifactu', plan: 'Tu plan', apariencia: 'Apariencia', ayuda: 'Ayuda y contacto', recomienda: 'Recomienda Fisquo', api: 'API y webhooks',
};
const DE_EMPRESA = ['plan', 'facturacion', 'marca', 'series', 'cobros', 'envio', 'gestoria', 'drive', 'controlat', 'importar', 'verifactu', 'api'];

// Series y numeración: cada actividad con su serie, si ya tiene facturas (entonces no se cambia) y el siguiente número.
async function datosSeries(u, anio) {
  const conFacturas = new Set((await todasFichas(u, 'facturas')).map((f) => f.a));
  const actividades = await Promise.all(actividadesDe(u).map(async (a) => ({ id: a.id, nombre: a.nombre, serie: a.serie || '', bloqueada: conFacturas.has(a.id), siguiente: await numeroPrevisto(u, a.serie || '', anio) })));
  const fs = serieSimplificada(actividadesDe(u));
  const [rectificativas, caja, simplificadas] = await Promise.all([numeroPrevisto(u, 'R', anio), numeroPrevisto(u, SERIE_CAJA, anio), numeroPrevisto(u, fs, anio)]);
  return { actividades, anio, rectificativas, caja: caja > 1 ? caja : 0, simplificadas, serieFs: fs };
}
// Tu gestoría en Fisquo (lib/despachos.js): su vínculo, lo que ha hecho y la conversación (la marca leída el chat al verse).
async function datosTuDespacho(u) {
  if (!u.despachoCliente || u.viaDespacho) return { despacho: null };
  // Aún sin aceptar: no hay registro, mensajes ni peticiones (el despacho no ve nada).
  if (u.despachoCliente.pendiente) return { despacho: u.despachoCliente };
  const [accesos, hilos, leido, peticiones] = await Promise.all([leerAccesos(u.empresa, 60), comentariosDe(u.empresa, { despacho: u.despachoCliente.id }), leidoDe(u.empresa), peticionesDe(u.empresa, { despacho: u.despachoCliente.id, ctx: u })]);
  return { despacho: u.despachoCliente, accesos, ultimo: mensajesDe(hilos).at(-1) || null, noLeidos: noLeidos(hilos, leido, 'cliente'), peticiones: pendientes(peticiones) };
}
// Los 8 últimos trimestres cerrados, del más reciente al más antiguo.
function ultimosTrimestres(hoy) {
  const lista = [];
  let x = trimestreAnterior(hoy);
  for (let i = 0; i < 8; i++) { lista.push(x); x = x.t === 1 ? { anio: x.anio - 1, t: 4 } : { anio: x.anio, t: x.t - 1 }; }
  return lista;
}

export default async function Seccion({ params, searchParams }) {
  const { seccion } = await params;
  if (!TITULOS[seccion]) notFound();
  const u = await requerir();
  const app = esApp((await headers()).get('user-agent'));
  if (DE_EMPRESA.includes(seccion) && !puede(u, 'empresa')) return <SinAcceso texto="Para cambiar esto necesitas el permiso «Datos de la empresa». Pídeselo al administrador." />;
  // Drive y la gestoría reciben cada factura y gasto (app/api/cuenta): elegir adónde van exige poder verlos.
  if (['gestoria', 'drive'].includes(seccion) && !puede(u, DETALLE)) return <SinAcceso texto="Para elegir adónde se envían las facturas y los gastos necesitas poder ver el resumen, las facturas y los gastos. Pídeselo al administrador." />;
  if (seccion === 'recomienda' && u.rol !== 'admin') return <SinAcceso texto="Solo el administrador de la empresa puede recomendar Fisquo con el enlace de la empresa." />;
  const llaves = seccion === 'seguridad'
    ? Object.entries((await redis.hgetall(`passkeys:${u.id}`)) || {}).map(([id, k]) => ({ id, nombre: k.nombre, creada: k.creada, usada: k.usada || null }))
    : [];
  // Tu plan: lo que ha usado en la prueba y su plan no incluye (lib/planes.js), con el plan que lo cubre.
  const usoPlan = seccion === 'plan' && !esFundador(u.plan) && !u.plan.pagado
    ? await Promise.all([usoDe(u.empresa), genteDe(u.empresa, leer)]).then(([uso, gente]) => ({ perdidas: perderia(u.plan, uso, gente).map((x) => x.texto), recomendado: planQueLoIncluye(u.plan, uso, gente)?.n || null }))
    : null;
  return (
    <main className={`pagina mk-look${seccion === 'plan' ? ` ${estilosPlan.pagina}` : ''}`}>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">{TITULOS[seccion]}</h1>
      {seccion === 'marca' && <Marca marca={u.marca} nombre={u.emisor?.nombre} />}
      {seccion === 'series' && <Series {...await datosSeries(u, Number(ahoraMadrid().slice(0, 4)))} />}
      {seccion === 'gestoria' && <TuDespacho {...await datosTuDespacho(u)} codigo={typeof (await searchParams)?.codigo === 'string' ? (await searchParams).codigo : ''} />}
      {seccion === 'gestoria' && <Gestoria gestoria={u.gestoria || null} trimestres={ultimosTrimestres(ahoraMadrid().slice(0, 10))} invitar={u.rol === 'admin'} emailListo={emailListo()} app={app} />}
      {seccion === 'api' && <AjustesApi key={u.empresa} inicial={{ claves: await clavesDe(u), webhooks: await webhooksDe(u) }} alcances={alcancesDe(u)} eventos={[...(puede(u, 'facturas') ? ['factura.creada', 'factura.cobrada'] : []), ...(puede(u, ['gastos', 'nominas']) ? ['gasto.creado'] : [])]} />}
      {seccion === 'apariencia' && <Apariencia inicial={(await cookies()).get('tema')?.value} />}
      {seccion === 'ayuda' && <Ayuda contacto={CONTACTO} app={app} />}
      {seccion === 'envio' && <EmailEnvio inicial={u.envio || {}} empresa={u.emisor || {}} />}
      {seccion === 'seguridad' && <FaceId lista={llaves} bloqueo={Boolean(u.bloqueoPantalla)} app={app} />}
      {seccion === 'seguridad' && u.pass && <DosPasos activa={u.dosPasos?.secreto ? { desde: u.dosPasos.desde ? diaDe(u.dosPasos.desde) : null, quedan: (u.dosPasos.recuperacion || []).length } : null} />}
      {seccion === 'plan' && <ElegirPlan plan={u.plan} tipoEmpresa={fiscalDe(u).tipo === 'sociedad' ? 'pym' : 'aut'} uso={usoPlan} admin={u.rol === 'admin'} app={app} />}
      {seccion === 'recomienda' && await (async () => {
        const resumen = await resumenRecomendaciones(u.empresa);
        return <Recomienda enlace={`${WEB}/registro?ref=${resumen.codigo}`} resumen={resumen} />;
      })()}
      {seccion === 'controlat' && <Controlat activo={Boolean(u.controlat)} />}
      {seccion === 'avisos' && <AvisosPush listo={pushListo()} />}
      {seccion === 'importar' && await (async () => { const origen = origenValido((await searchParams)?.origen); return <Importar key={origen || 'sin-origen'} origen={origen} />; })()}
      {seccion === 'verifactu' && await (async () => {
        const regs = await leer(u, 'registros');
        const facturas = await documentos(u, 'facturas', [...new Set((regs || []).map((r) => r.factura))]);
        const cuentas = estadoVerifactu(regs || [], { modo: u.verifactu || undefined, facturas: Object.fromEntries((facturas || []).map((f) => [f.id, f])) });
        return <Verifactu modo={u.verifactu || null} admin={u.rol === 'admin'} listo={certificadoListo()} faltaEmisor={!u.emisor?.nif || !u.emisor?.nombre} fisquo={{ razon: process.env.FISQUO_RAZON || '', nif: process.env.FISQUO_NIF || '' }} cuentas={cuentas} />;
      })()}
      {['facturacion', 'cobros', 'marca', 'perfil', 'drive', 'seguridad'].includes(seccion) && <Ajustes seccion={seccion} emisor={u.emisor || {}} drive={u.drive} driveError={u.driveError} sociedad={fiscalDe(u).tipo === 'sociedad'} nombre={u.nombre}
        extra={seccion === 'cobros' ? <StripeConnect estado={u.stripeConnect?.estado || null} admin={u.rol === 'admin'} listo={stripeListo()} aviso={(await searchParams)?.stripe} /> : null} />}
      {seccion === 'perfil' && (
        <section className="grupo">
          <div className="grupo-c">
            <div className="celda"><span className="txt">Email<small>{u.email}</small></span></div>
            <a href="/ajustes/seguridad" className="celda ir"><span className="txt">Seguridad<small>Contraseña, Face ID, verificación en dos pasos y accesos</small></span></a>
          </div>
          <p className="grupo-pie">Para cambiar tu email, escríbenos desde Ayuda y contacto.</p>
        </section>
      )}
      {seccion === 'seguridad' && <AccesosRecientes lista={await accesosDe(u.id)} />}
      {seccion === 'seguridad' && <form method="post" action="/api/logout?todas=1"><button className="borrar ancho">Cerrar sesión en todos los dispositivos</button></form>}
    </main>
  );
}

export async function generateMetadata({ params }) {
  return { title: TITULOS[(await params).seccion] || 'Ajustes' };
}
