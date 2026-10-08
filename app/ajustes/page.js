import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { perfilDe, puede } from '@/lib/permisos';
import Avatar from '@/components/Avatar';
import Ico from '@/components/Ico';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { modoDe } from '@/lib/verifactu';
import { miEmpleado } from '@/lib/jornadaServidor';
import { ahoraMadrid } from '@/lib/jornada';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import '@/app/empresas.css';

export const dynamic = 'force-dynamic';

const Celda = ({ href, ico, titulo, detalle, aviso }) => (
  <Ir href={href} className="celda ir">
    <Ico n={ico} />
    <span className="txt">{titulo}{detalle && <small className={aviso ? 'aviso' : ''}>{detalle}</small>}</span>
  </Ir>
);

// Ajustes como en el iPhone: una lista corta y cada cosa en su pantalla.
export default async function Page() {
  const u = await requerir();
  const llaves = Object.keys((await redis.hgetall(`passkeys:${u.id}`)) || {}).length;
  const avisos = await redis.hlen(`push:${u.id}`);
  const empresa = puede(u, 'empresa');
  const e = u.emisor || {};
  const datosCompletos = e.nombre && e.nif && e.direccion && e.iban;
  const modo = modoDe(u);
  const { yo } = await miEmpleado(u, ahoraMadrid().slice(0, 10));
  return (
    <main className="pagina">
      <h1 className="titulo">Ajustes</h1>
      <div className="perfil">
        <Avatar nombre={u.nombre} size={48} />
        <div><strong>{u.nombre}</strong><small>{u.email}</small><small>{perfilDe(u)} en {u.empresaNombre}</small></div>
      </div>

      {empresa && (
        <section className="grupo">
          <h2 className="grupo-t">Empresa</h2>
          <div className="grupo-c">
            <Celda href="/ajustes/facturacion" ico="datos" titulo="Datos de facturación" detalle={datosCompletos ? `${e.nombre} · ${e.nif}` : 'Faltan datos: rellénalos antes de facturar'} aviso={!datosCompletos} />
            <Celda href="/bienvenida?editar=1" ico="actividad" titulo="Actividades y modelos" detalle={`${fiscalDe(u).tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'} · ${actividadesDe(u).map((x) => x.nombre).join(', ')}`} />
            <Celda href="/ajustes/marca" ico="marca" titulo="Logo y color" detalle={u.marca?.logo ? 'Con logo' : 'Sin logo'} />
            {puede(u, 'nominas') && <Celda href="/nominas" ico="usuarios" titulo="Equipo y nóminas" detalle="Empleados, nóminas y modelo 111" />}
            <Celda href="/ajustes/importar" ico="excel" titulo="Importar datos" detalle="Clientes, facturas, gastos y productos desde Holded o Excel" />
            {(puede(u, 'usuarios') || u.admin) && <Celda href="/usuarios" ico="usuarios" titulo="Usuarios y permisos" detalle="Quién entra y qué puede hacer" />}
            {u.rol === 'admin' && <Celda href="/ajustes/actividad" ico="seguridad" titulo="Actividad" detalle="Permisos, datos, borrados y exportaciones" />}
            {u.rol === 'admin' && (
              <a href="/api/exportar/todo" download className="celda ir">
                <Ico n="excel" />
                <span className="txt">Descargar todos los datos<small>Un .zip con todo lo de la empresa</small></span>
              </a>
            )}
          </div>
          {modo && <p className="grupo-pie">Verifactu activo{modo === 'pruebas' ? ' en modo pruebas' : ''}: cada factura nueva queda registrada y lleva su QR.</p>}
        </section>
      )}

      {(u.misEmpresas?.length > 1 || u.admin) && (
        <section className="grupo" id="empresas">
          <h2 className="grupo-t">{u.misEmpresas?.length > 1 ? 'Tus empresas' : 'Más empresas'}</h2>
          <CambiarEmpresa empresas={u.misEmpresas} actual={u.empresa} puedeCrear={u.admin} />
          <p className="grupo-pie">Cada empresa con sus datos, su numeración de facturas, sus modelos y sus permisos.</p>
        </section>
      )}

      <section className="grupo">
        <div className="grupo-c">
          <Celda href="/asistente" ico="asistente" titulo="Pregunta a Netto" detalle="Respuestas con las cifras de la app" />
          {(yo || puede(u, 'nominas')) && <Celda href="/jornada" ico="plazo" titulo={yo ? 'Fichar y registro de jornada' : 'Registro de jornada'} detalle={yo ? 'Entrada, salida y pausas; tus horas del mes' : 'Horas de tu equipo y Excel para la Inspección'} />}
        </div>
      </section>

      <section className="grupo">
        <h2 className="grupo-t">Seguridad y avisos</h2>
        <div className="grupo-c">
          <Celda href="/ajustes/seguridad" ico="seguridad" titulo="Face ID y contraseña" detalle={llaves ? `Face ID en ${llaves} ${llaves === 1 ? 'dispositivo' : 'dispositivos'}` : 'Face ID desactivado'} />
          <Celda href="/ajustes/avisos" ico="plazo" titulo="Avisos en el móvil" detalle={avisos ? `Activados en ${avisos} ${avisos === 1 ? 'dispositivo' : 'dispositivos'}` : 'Plazos de Hacienda y facturas vencidas'} />
        </div>
      </section>

      {empresa && (
        <section className="grupo">
          <h2 className="grupo-t">Conexiones</h2>
          <div className="grupo-c">
            <Celda href="/ajustes/drive" ico="drive" titulo="Google Drive" detalle={u.drive?.url ? (u.driveError ? 'Con errores: revisa la conexión' : 'Conectado') : 'Sin conectar'} aviso={Boolean(u.drive?.url && u.driveError)} />
            {(u.admin || u.controlat) && <Celda href="/ajustes/controlat" ico="conexion" titulo="Controla'T" detalle={u.controlat ? 'Enviando tu neto mensual' : 'Sin conectar'} />}
          </div>
        </section>
      )}

      <form method="post" action="/api/logout"><button className="borrar ancho">Cerrar sesión</button></form>
    </main>
  );
}
