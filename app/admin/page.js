import { requerirAdmin } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { actividadReciente, ultimaActividad } from '@/lib/actividad';
import { ESTADOS, ORIGENES, resumenAdmin } from '@/lib/admin';
import { textoDias } from '@/lib/embudo';
import { embudoDe } from '@/lib/embudoServidor';
import { emailListo } from '@/lib/email';
import { avisosRemitente, dkimResend, leerRemitente } from '@/lib/adminAjustes';
import Volver from '@/components/Volver';
import AdminEmpresas from '@/components/AdminEmpresas';
import AdminDespachos from '@/components/AdminDespachos';
import AdminDosPasos from '@/components/AdminDosPasos';
import { PRUEBA_DIAS } from '@/lib/prueba';
import { PRUEBA_GESTORIA_DIAS } from '@/lib/gestorias';
import { RECOMENDACION_DIAS } from '@/lib/recomendaciones';
import '@/app/admin/admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administración' };

const euros = (c) => (c / 100).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
const fecha = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

// Barras sencillas (sin librería): cada barra lleva su valor en el título y en texto para lectores de pantalla.
function Barras({ datos, etiqueta, valor, titulo }) {
  const max = Math.max(1, ...datos.map(valor));
  return <figure className="adm-barras">
    <figcaption>{titulo}</figcaption>
    <div className="adm-barras-zona" role="list">
      {datos.map((d) => <div key={etiqueta(d)} role="listitem" className="adm-barra" title={`${etiqueta(d)}: ${valor(d)}`}>
        <span style={{ height: `${(100 * valor(d)) / max}%` }} /><b className="sr">{etiqueta(d)}: {valor(d)}</b>
      </div>)}
    </div>
    <div className="adm-barras-eje"><span>{etiqueta(datos[0])}</span><span>{etiqueta(datos.at(-1))}</span></div>
  </figure>;
}

// Panel del administrador de Fisquo: negocio (ingresos, pruebas, conversión), uso y todas las empresas.
export default async function Admin() {
  await requerirAdmin();
  const [empresas, usuarios, actividad, ultima] = await Promise.all([redis.hgetall('empresas'), redis.hgetall('usuarios'), actividadReciente(30), ultimaActividad()]);
  const r = resumenAdmin({ empresas: Object.values(empresas || {}), usuarios: Object.values(usuarios || {}), actividad, ultima });
  const k = r.kpis;
  // Embudo de activación (lib/embudo.js): solo índices y contadores, no documentos.
  const embudo = await embudoDe({ filas: r.filas, empresas: empresas || {}, ultima });
  const remitente = process.env.RESEND_FROM || '';
  const rem = leerRemitente(remitente || 'Fisquo <no-reply@fisquo.com>');
  const dkim = await dkimResend(rem.dominio);
  const avisosCorreo = avisosRemitente(remitente);
  const clave = process.env.STRIPE_SECRET_KEY || '';
  const cobros = [
    ['Clave de Stripe', clave ? (clave.startsWith('sk_live') || clave.startsWith('rk_live') ? 'Real' : 'De pruebas: todavía no se cobra de verdad') : 'Falta: nadie puede contratar', clave.includes('_live')],
    ['Aviso de pagos (webhook)', process.env.STRIPE_WEBHOOK_SECRET ? 'Configurado' : 'Falta', Boolean(process.env.STRIPE_WEBHOOK_SECRET)],
    ['Emails (avisos de prueba)', emailListo() ? 'Configurado' : 'Falta', emailListo()],
  ];

  return <main className="pagina mk-look adm">
    <Volver href="/ajustes">Ajustes</Volver>
    <h1 className="titulo">Panel de Fisquo</h1>
    <p className="adm-intro">Solo lo ves tú. Las cifras son sin IVA; las empresas Fundador no cuentan en ingresos ni en conversión.</p>

    <nav className="adm-accesos" aria-label="Accesos directos">
      <a href="/admin/correos"><strong>Correos</strong><span>Verlos y enviarte una prueba</span></a>
      <a href="#adm-ajustes"><strong>Configuración</strong><span>Remitente, dominio y cobros</span></a>
      <a href="#adm-empresas"><strong>Empresas</strong><span>Planes, pruebas y Fundador</span></a>
      <a href="/usuarios"><strong>Usuarios</strong><span>Dar de alta una empresa</span></a>
    </nav>

    <section className="adm-kpis" aria-label="Cifras principales">
      <div><small>Ingresos al mes</small><strong>{euros(k.mrr)}</strong><span>{euros(k.arr)} al año</span></div>
      <div><small>Empresas de pago</small><strong>{r.porEstado.pago}</strong><span>{r.porEstado.impago ? `${r.porEstado.impago} con pago fallido` : 'Sin pagos fallidos'}</span></div>
      <div><small>En prueba</small><strong>{r.porEstado.prueba}</strong><span>{k.pruebasQueAcabanEn7} {k.pruebasQueAcabanEn7 === 1 ? 'acaba' : 'acaban'} esta semana</span></div>
      <div><small>Conversión</small><strong>{k.conversion === null ? '—' : `${k.conversion} %`}</strong><span>Pruebas acabadas que pagan</span></div>
      <div><small>Altas este mes</small><strong>{k.altasMes}</strong><span>Registros con prueba</span></div>
      <div><small>Personas activas</small><strong>{k.activos7}</strong><span>7 días · {k.activosHoy} hoy · {k.activos30} en 30 días</span></div>
    </section>

    <section className="adm-graficos">
      <Barras titulo="Altas por semana (12 semanas)" datos={r.altas} etiqueta={(d) => fecha(d.desde)} valor={(d) => d.n} />
      <Barras titulo="Personas que entran cada día (30 días)" datos={r.diario} etiqueta={(d) => fecha(d.dia)} valor={(d) => d.usuarios} />
    </section>

    {embudo && <section className="adm-caja adm-embudo" aria-labelledby="adm-embudo-t">
      <h2 id="adm-embudo-t">Activación de las altas</h2>
      <p className="adm-pie">De las empresas que se dan de alta, cuántas llegan a cada paso. Cuenta cada una en un paso solo si ha hecho también los anteriores; «% previo» es sobre el paso de arriba y los días son la mediana desde el alta.</p>
      <div className="adm-embudo-rejilla">
        {embudo.map((v) => <table key={v.id} className="adm-embudo-tabla">
          <caption>{v.nombre}</caption>
          <thead><tr><th scope="col">Paso</th><th scope="col">Empresas</th><th scope="col">% previo</th><th scope="col">Mediana</th></tr></thead>
          <tbody>{v.pasos.map((p) => <tr key={p.id}>
            <th scope="row">{p.nombre}<span className="adm-embudo-barra" aria-hidden><i style={{ width: `${p.pctAltas ?? 0}%` }} /></span></th>
            <td>{p.n}</td>
            <td>{p.pctPrevio === null ? '' : `${p.pctPrevio} %`}</td>
            <td title={p.id !== 'alta' && p.n > p.conDia ? `${p.conDia} de ${p.n} con día conocido` : undefined}>{p.id === 'alta' ? '' : textoDias(p.mediana)}</td>
          </tr>)}</tbody>
        </table>)}
      </div>
      <p className="adm-pie">Factura y gasto: el día de la más antigua (si es anterior al alta, cuenta 0 días). Banco: el día en que se subió el extracto o se conectó la cuenta. Modelo: cuando se marcó como presentado; los que no guardan el día (el 130 a cero, el 202) cuentan en el embudo pero no en la mediana.</p>
    </section>}

    <section className="adm-dos">
      <div className="adm-caja">
        <h2>Empresas por estado</h2>
        <ul className="adm-lista">{Object.entries(ESTADOS).map(([e, t]) => <li key={e}><span className={`adm-estado adm-${e}`}>{t}</span><b>{r.porEstado[e]}</b></li>)}</ul>
        <p className="adm-pie">{k.empresas} empresas · {k.usuarios} personas ({k.verificados} con el email confirmado)</p>
      </div>
      <div className="adm-caja">
        <h2>Planes</h2>
        {r.planes.length ? <ul className="adm-lista">{r.planes.map((p) => <li key={p.plan}><span>{p.plan}</span><b>{p.pago} de pago · {p.prueba} en prueba</b></li>)}</ul> : <p className="adm-pie">Todavía no hay empresas registradas con plan.</p>}
      </div>
    </section>

    <section className="adm-dos">
      <div className="adm-caja">
        <h2>De dónde vienen</h2>
        <ul className="adm-lista">{r.origenes.map((o) => <li key={o.origen}><span>{ORIGENES[o.origen]} ({o.origen === 'gestoria' ? PRUEBA_GESTORIA_DIAS : o.origen === 'recomendacion' ? PRUEBA_DIAS + RECOMENDACION_DIAS : PRUEBA_DIAS} días de prueba)</span><b>{o.total} · {o.prueba} en prueba · {o.pagan} pagan{o.conversion !== null ? ` · ${o.conversion} %` : ''}</b></li>)}</ul>
        <p className="adm-pie">El porcentaje es la conversión de las pruebas ya acabadas de cada canal. Los cupones de Stripe se descuentan de los ingresos.</p>
      </div>
      <div className="adm-caja">
        <h2>Recomendaciones</h2>
        <ul className="adm-lista">
          <li><span>Empresas que llegan recomendadas</span><b>{r.recomendaciones.registradas}</b></li>
          <li><span>Ya han pagado (premio dado)</span><b>{r.recomendaciones.premiadas}</b></li>
          <li><span>Meses regalados a quien recomienda</span><b>{r.recomendaciones.meses}</b></li>
          {r.recomendaciones.top.map((t) => <li key={t.nombre}><span>· {t.nombre}</span><b>{t.meses} {t.meses === 1 ? 'mes' : 'meses'}</b></li>)}
        </ul>
      </div>
    </section>

    <section className="adm-caja adm-forma" aria-labelledby="adm-forma-t">
      <h2 id="adm-forma-t">Planes que no cuadran{k.formaNoCuadra ? ` (${k.formaNoCuadra})` : ''}</h2>
      {k.formaNoCuadra ? <>
        <p className="adm-pie">Sociedades con un plan de Autónomos que ya estaban así antes del bloqueo. No se les ha cambiado nada ni se les ha escrito.</p>
        <ul className="adm-lista">{r.filas.filter((f) => f.forma === 'no-cuadra').map((f) => <li key={f.id}>
          <span><strong>{f.nombre}</strong> · {f.nif || 'sin NIF'} · {f.tipo} {f.plan}{f.periodo === 'anio' ? ' anual' : ''}</span>
          <b><span className={`adm-estado adm-${f.estado}`}>{ESTADOS[f.estado]}</span> {f.motivoForma}</b>
        </li>)}</ul>
        <p className="adm-pie">Para verlas en la lista de empresas, elige «Planes que no cuadran» en el filtro de abajo.</p>
      </> : <p className="adm-pie">Todas las empresas tienen un plan que cuadra con su forma jurídica.</p>}
    </section>

    <section className="adm-caja" aria-labelledby="adm-despachos-t">
      <h2 id="adm-despachos-t">Despachos asociados</h2>
      <AdminDespachos />
    </section>

    <section className="adm-caja" aria-labelledby="adm-dos-pasos-t">
      <h2 id="adm-dos-pasos-t">Soporte: verificación en dos pasos</h2>
      <p className="adm-pie">Para quien ha perdido el móvil y los códigos de recuperación, después de comprobar que es el titular.</p>
      <AdminDosPasos />
    </section>

    <section id="adm-ajustes" className="adm-dos" aria-label="Configuración">
      <div className="adm-caja">
        <h2>Correos automáticos</h2>
        <ul className="adm-lista">
          <li><span>Envío (clave de Resend)</span><b className={emailListo() ? 'adm-ok' : 'adm-mal'}>{emailListo() ? 'Configurado' : 'Falta: no sale ningún correo'}</b></li>
          <li><span>Remitente</span><b className={avisosCorreo.length ? 'adm-mal' : 'adm-ok'}>{rem.nombre ? `${rem.nombre} <${rem.email}>` : rem.email}</b></li>
          <li><span>Dominio {rem.dominio} en Resend</span><b className={dkim ? 'adm-ok' : 'adm-mal'}>{dkim ? 'Firma DKIM publicada' : 'Sin firma DKIM: revisa el dominio en Resend'}</b></li>
        </ul>
        {avisosCorreo.map((a) => <p key={a} className="adm-pie adm-mal">{a}</p>)}
        <div className="adm-botones">
          <a className="adm-boton" href="/admin/correos">Ver correos y enviarme una prueba</a>
          <a className="adm-boton" href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">Dominios en Resend ↗</a>
          <a className="adm-boton" href="https://resend.com/emails" target="_blank" rel="noopener noreferrer">Correos enviados ↗</a>
        </div>
        <p className="adm-pie">El remitente es la variable RESEND_FROM de Vercel (Production). Si la cambias, hace falta un despliegue nuevo.</p>
      </div>
      <div className="adm-caja">
        <h2>Cobros</h2>
        <ul className="adm-lista">{cobros.map(([t, v, ok]) => <li key={t}><span>{t}</span><b className={ok ? 'adm-ok' : 'adm-mal'}>{v}</b></li>)}</ul>
        <div className="adm-botones">
          <a className="adm-boton" href="https://dashboard.stripe.com/settings/public" target="_blank" rel="noopener noreferrer">Nombre del negocio en Stripe ↗</a>
          <a className="adm-boton" href="https://dashboard.stripe.com/settings/emails" target="_blank" rel="noopener noreferrer">Correos de Stripe ↗</a>
          <a className="adm-boton" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Variables en Vercel ↗</a>
        </div>
        <p className="adm-pie">En Stripe: deja activados los recibos y desactiva su email de pago fallido (ya lo manda Fisquo). Las claves van en Vercel › Settings › Environment Variables (Production).</p>
      </div>
    </section>

    <div id="adm-empresas" />
    <AdminEmpresas filas={r.filas} />
    <p className="adm-pie">Para regalar una empresa a otra persona (plan Fundador), usa <a href="/usuarios">Usuarios › Dar de alta una empresa</a>.</p>
  </main>;
}
