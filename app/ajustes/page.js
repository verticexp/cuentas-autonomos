import { cookies, headers } from 'next/headers';
import { esApp } from '@/lib/app';
import { TIPOS, diasPrueba, esFundador } from '@/lib/prueba';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { DETALLE, perfilDe, puede } from '@/lib/permisos';
import Avatar from '@/components/Avatar';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { modoDe } from '@/lib/verifactu';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import Volver from '@/components/Volver';
import { miEmpleado } from '@/lib/jornadaServidor';
import { ahoraMadrid } from '@/lib/jornada';
import '@/app/empresas.css';
import '@/app/mk.css';
import '@/app/mas.css';

export const dynamic = 'force-dynamic';

// Iconos de cada ajuste, con el color de su grupo (app/lateral.css [data-tono]), como en «Más».
const I = {
  regalo: <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.5S9 7 12 7c3 0 5-.5 5-1.5S13.5 4 12 7z" />,
  panel: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  plan: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  empresa: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13.5h3" /></>,
  actividad: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .7 3.2 2.3 3.7 5" /></>,
  gestoria: <><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  diseno: <><circle cx="12" cy="12" r="8.5" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /><path d="M12 20.5a2.5 2.5 0 0 1 0-5h1.5" /></>,
  series: <path d="M10 6h10M10 12h10M10 18h10M4 5h2v4M4 9h2.5M4 15.5a1.2 1.2 0 0 1 2.2-.6c.4.7-.2 1.3-2.2 3.1h2.5" />,
  cobros: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12.5h2M3 10h13a2 2 0 0 1 2 2" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  verifactu: <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7zM8.5 12l2.5 2.5L16 9.5" />,
  banco: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  drive: <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18z" />,
  conexion: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  seguridad: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  avisos: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  apariencia: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>,
  importar: <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" />,
  descargar: <path d="M4 7h16v13H4zM4 7l2-3h12l2 3M12 10v6M9 13l3 3 3-3" />,
  registro: <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />,
  ayuda: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2-2.3 3.5M12 17h.01" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  baja: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
};

const Celda = ({ href, ico, tono, titulo, detalle, aviso, descarga }) => {
  const dentro = (
    <>
      <span className="mas-ico" data-tono={tono}><svg viewBox="0 0 24 24" aria-hidden>{I[ico]}</svg></span>
      <span className="txt">{titulo}{detalle && <small className={aviso ? 'aviso' : ''}>{detalle}</small>}</span>
    </>
  );
  return descarga
    ? <a href={href} download className="celda ir mas-fila">{dentro}</a>
    : <Ir href={href} className="celda ir mas-fila">{dentro}</Ir>;
};

const Grupo = ({ titulo, pie, children }) => {
  const filas = [children].flat(Infinity).filter(Boolean);
  if (!filas.length) return null;
  return (
    <section className="grupo">
      {titulo && <h2 className="grupo-t">{titulo}</h2>}
      <div className="grupo-c">{filas}</div>
      {pie && <p className="grupo-pie">{pie}</p>}
    </section>
  );
};

const TEMA = { claro: 'Claro', oscuro: 'Oscuro' };

// Ajustes como en el iPhone: una lista corta por grupos y cada cosa en su pantalla. Solo configuración: las pantallas de
// trabajo (nóminas, jornada, Pregunta a Fisquo…) están en «Más».
export default async function Page() {
  const u = await requerir();
  const app = esApp((await headers()).get('user-agent'));
  const [llaves, avisos] = await Promise.all([redis.hgetall(`passkeys:${u.id}`).then((x) => Object.keys(x || {}).length), redis.hlen(`push:${u.id}`)]);
  const empresa = puede(u, 'empresa');
  const admin = u.rol === 'admin';
  const e = u.emisor || {};
  const datosCompletos = e.nombre && e.nif && e.direccion && e.iban;
  const modo = modoDe(u);
  const series = actividadesDe(u).map((a) => a.serie || 'sin letra');
  const formas = ['Transferencia', e.bizum && 'Bizum', e.otroPago].filter(Boolean);
  const tema = TEMA[(await cookies()).get('tema')?.value] || 'Automático';
  const dias = diasPrueba(u.plan);
  // Quien ficha sin llevar las nóminas no tiene el registro de jornada en la barra lateral del ordenador: aquí, su «Fichar».
  const fichar = !puede(u, 'nominas') && (await miEmpleado(u, ahoraMadrid().slice(0, 10))).yo;
  return (
    <main className="pagina mk-look ajustes-pagina">
      {/* En el móvil se llega desde «Más»: hay que poder volver. En el ordenador, Ajustes está en la barra lateral. */}
      <div className="volver-movil"><Volver href="/mas">Más</Volver></div>
      <h1 className="titulo">Ajustes</h1>
      <Ir href="/ajustes/perfil" className="mas-perfil">
        <Avatar nombre={u.nombre} size={48} />
        <span className="txt"><strong>{u.nombre}</strong><small>{u.email}</small><small>{perfilDe(u)} en {u.empresaNombre}</small></span>
        <span className="mas-perfil-ir">›</span>
      </Ir>

      {!app && u.admin && <Grupo titulo="Fisquo"><Celda href="/admin" ico="panel" tono="azul" titulo="Panel de Fisquo" detalle="Empresas, ingresos, pruebas y actividad" /></Grupo>}

      {empresa && (
        <Grupo titulo="Tu empresa">
          {!app && <Celda href="/ajustes/plan" ico="plan" tono="azul" titulo="Tu plan" detalle={esFundador(u.plan) ? 'Fundador · gratis de por vida' : `${TIPOS[u.plan.tipo]} ${u.plan.nombre}${dias !== null ? ` · prueba: ${dias} días` : ''}`} aviso={dias !== null && dias <= 7} />}
          {!app && u.rol === 'admin' && <Celda href="/ajustes/recomienda" ico="regalo" tono="azul" titulo="Recomienda Fisquo" detalle="Un mes gratis para ti y para quien invites" />}
          <Celda href="/ajustes/facturacion" ico="empresa" tono="azul" titulo="Datos de la empresa" detalle={datosCompletos ? `${e.nombre} · ${e.nif}` : 'Faltan datos: rellénalos antes de facturar'} aviso={!datosCompletos} />
          <Celda href="/bienvenida?editar=1" ico="actividad" tono="azul" titulo="Actividades e impuestos" detalle={`${fiscalDe(u).tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'} · ${actividadesDe(u).map((x) => x.nombre).join(', ')}`} />
          {(puede(u, 'usuarios') || u.admin) && <Celda href="/usuarios" ico="usuarios" tono="azul" titulo="Usuarios y permisos" detalle="Quién entra y qué puede hacer" />}
          {puede(u, DETALLE) && <Celda href="/ajustes/gestoria" ico="gestoria" tono="azul" titulo="Tu gestoría" detalle={u.gestoria?.email ? `${u.gestoria.nombre || u.gestoria.email}${u.gestoria.auto ? ' · paquete automático' : ''}` : 'Invítala y mándale el paquete de cada trimestre'} />}
        </Grupo>
      )}
      {!empresa && puede(u, 'usuarios') && <Grupo titulo="Tu empresa"><Celda href="/usuarios" ico="usuarios" tono="azul" titulo="Usuarios y permisos" detalle="Quién entra y qué puede hacer" /></Grupo>}

      {empresa && (
        <Grupo titulo="Facturas y cobros" pie={modo ? `Verifactu activo${modo === 'pruebas' ? ' en modo pruebas' : ''}: cada factura nueva queda registrada y lleva su QR.` : null}>
          <Celda href="/ajustes/marca" ico="diseno" tono="verde" titulo="Diseño de factura" detalle={[u.marca?.logo ? 'Con logo' : 'Sin logo', e.pie && 'pie propio', e.notaDefecto && 'nota por defecto'].filter(Boolean).join(' · ')} />
          <Celda href="/ajustes/series" ico="series" tono="verde" titulo="Series y numeración" detalle={`Series: ${series.join(', ')}`} />
          <Celda href="/ajustes/cobros" ico="cobros" tono="verde" titulo="Cobros" detalle={`${e.plazo ?? 30} días · ${formas.join(', ')}${e.recordatorios ? ' · con recordatorios' : ''}`} />
          <Celda href="/ajustes/envio" ico="email" tono="verde" titulo="Email de envío" detalle={u.envio?.asunto || u.envio?.mensaje ? 'Mensaje propio' : 'Asunto, mensaje y firma'} />
          <Celda href="/ajustes/verifactu" ico="verifactu" tono="verde" titulo="Verifactu" detalle={modo === 'real' ? 'Activo: cada factura se registra en la AEAT' : modo === 'pruebas' ? 'En pruebas' : 'Sin activar'} />
        </Grupo>
      )}

      {empresa && (puede(u, DETALLE) || u.admin || u.controlat || puede(u, 'empresa')) && (
        <Grupo titulo="Conexiones">
          {puede(u, 'empresa') && <Celda href="/ajustes/api" ico="conexion" tono="ambar" titulo="API y webhooks" detalle="Claves de acceso y avisos para tus programas" />}
          {puede(u, DETALLE) && <Celda href="/banco" ico="banco" tono="ambar" titulo="Bancos" detalle="Cuentas, extractos y conciliación" />}
          {puede(u, DETALLE) && <Celda href="/ajustes/drive" ico="drive" tono="ambar" titulo="Google Drive" detalle={u.drive?.url ? (u.driveError ? 'Con errores: revisa la conexión' : 'Conectado') : 'Sin conectar'} aviso={Boolean(u.drive?.url && u.driveError)} />}
          {(u.admin || u.controlat) && <Celda href="/ajustes/controlat" ico="conexion" tono="ambar" titulo="Controla'T" detalle={u.controlat ? 'Enviando tu neto mensual' : 'Sin conectar'} />}
        </Grupo>
      )}

      <section className="grupo" id="empresas">
        <h2 className="grupo-t">{u.misEmpresas?.length > 1 ? 'Tus empresas' : 'Más empresas'}</h2>
        <CambiarEmpresa empresas={u.misEmpresas} actual={u.empresa} />
        <p className="grupo-pie">{app ? 'Cada empresa con sus datos, su numeración de facturas y sus permisos.' : 'Cada empresa con sus datos, su numeración de facturas, sus permisos y su propio plan, con su mes de prueba.'}</p>
      </section>

      {fichar && <Grupo titulo="Tu jornada"><Celda href="/jornada" ico="reloj" tono="violeta" titulo="Fichar" detalle="Entrada, salida, pausas y tus horas del mes" /></Grupo>}

      <Grupo titulo="Seguridad y avisos">
        <Celda href="/ajustes/seguridad" ico="seguridad" tono="violeta" titulo={app ? 'Contraseña y bloqueo' : 'Face ID y contraseña'} detalle={app ? 'Contraseña y bloqueo de pantalla' : llaves ? `Face ID en ${llaves} ${llaves === 1 ? 'dispositivo' : 'dispositivos'}` : 'Face ID desactivado'} />
        {!app && <Celda href="/ajustes/avisos" ico="avisos" tono="violeta" titulo="Avisos en el móvil" detalle={avisos ? `Activados en ${avisos} ${avisos === 1 ? 'dispositivo' : 'dispositivos'}` : 'Plazos de Hacienda y facturas vencidas'} />}
        {admin && <Celda href="/ajustes/actividad" ico="registro" tono="violeta" titulo="Actividad" detalle="Permisos, datos, borrados y exportaciones" />}
      </Grupo>

      <Grupo titulo="App">
        <Celda href="/ajustes/apariencia" ico="apariencia" tono="gris" titulo="Apariencia" detalle={tema} />
        {empresa && <Celda href="/ajustes/importar" ico="importar" tono="gris" titulo="Importar datos" detalle="Clientes, facturas, gastos y productos desde Holded o Excel" />}
        {admin && <Celda href="/api/exportar/todo" descarga ico="descargar" tono="gris" titulo="Descargar todos los datos" detalle="Un .zip con todo lo de la empresa" />}
        <Celda href="/ajustes/ayuda" ico="ayuda" tono="gris" titulo="Ayuda y contacto" detalle="Preguntas frecuentes y escribirnos" />
      </Grupo>

      {!u.admin && <Grupo>
        {admin && <Celda href="/ajustes/baja" ico="baja" tono="rojo" titulo="Dar de baja la empresa" detalle="Cerrar la empresa y borrar los datos" />}
        <Celda href="/ajustes/eliminar-cuenta" ico="baja" tono="rojo" titulo="Eliminar mi cuenta" detalle="Eliminar tu cuenta y tus datos personales" />
      </Grupo>}

      <form method="post" action="/api/logout"><button type="submit" className="borrar ancho">Cerrar sesión</button></form>
    </main>
  );
}

export const metadata = { title: 'Ajustes' };
