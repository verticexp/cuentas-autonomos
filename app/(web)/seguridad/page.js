import Link from 'next/link';
import Icono from '@/components/web/Icono';
import { Cta, Encabezado, Flecha } from '@/components/web/Bloques';

export const metadata = { title: 'Seguridad · Netto', description: 'Cómo protege Netto tus datos: acceso con Face ID y llaves de acceso, permisos por área, conexión cifrada y exportaciones seguras.' };

const MEDIDAS = [
  { i: 'candado', t: 'Face ID, huella o llave de acceso', d: 'Bloquea Netto en tu móvil y ábrelo con tu cara, tu huella o una llave de acceso (passkey), además de tu contraseña.' },
  { i: 'equipo', t: 'Permisos por área', d: 'Cada usuario ve solo lo que necesita: resumen, facturar, gastos, nóminas o usuarios. Tu gestoría ve tus facturas y gastos sin tocarlos.' },
  { i: 'escudo', t: 'Protección contra suplantación', d: 'Todas las acciones que cambian datos se comprueban para que solo puedan venir de la propia app (protección anti-CSRF).' },
  { i: 'llave', t: 'Conexión siempre cifrada', d: 'Netto solo funciona por HTTPS, con HSTS para que tu navegador nunca se conecte sin cifrar.' },
  { i: 'documento', t: 'Archivos revisados', d: 'Los Excel que subes se revisan antes de abrirlos para frenar archivos manipulados, y los CSV que descargas no pueden ejecutar fórmulas maliciosas.' },
  { i: 'correo', t: 'Invitaciones que caducan', d: 'Las invitaciones a tu equipo caducan a los 7 días. Los enlaces no se filtran a otras webs.' },
];

export default function Seguridad() {
  return (
    <>
      <section className="web-hero-pag centro">
        <span className="web-fcard-ico grande web-entra"><Icono n="escudo" /></span>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Tus números son tuyos. <em>Y están a salvo.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Tus facturas, tu equipo y tus impuestos son lo más delicado de tu negocio. Así los protege Netto.</p>
      </section>

      <section className="web-sec web-sec-pegada">
        <div className="web-extras tres">
          {MEDIDAS.map((m, k) => (
            <div key={m.t} data-foco data-r style={{ '--d': `${(k % 3) * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n={m.i} /></span>
              <b>{m.t}</b><p>{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">Sin ataduras</p>
            <h2>Te llevas tus datos cuando quieras</h2>
            <p>Descarga tus facturas en PDF, tus registros en CSV y el paquete trimestral en Excel. Puedes guardar además una copia de tus facturas en tu Google Drive.</p>
            <Link href="/privacidad" className="web-btn web-btn-oscuro">Leer la política de privacidad<Flecha /></Link>
          </div>
          <ol>
            <li><b>PDF</b><span>Cada factura y presupuesto, listo para enviar o archivar.</span></li>
            <li><b>CSV y Excel</b><span>Facturas, gastos y el paquete trimestral para tu gestoría.</span></li>
            <li><b>Google Drive</b><span>Una copia de tus facturas en tu propia nube.</span></li>
          </ol>
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Banco" titulo="Tu banco, sin darnos las llaves" sub="Hoy trabajas con extractos que tú descargas y subes: Netto nunca tiene acceso a tu banca online. Cuando llegue la conexión directa, será de solo lectura a través de un proveedor autorizado, y podrás desconectarla cuando quieras." />
      </section>

      <Cta titulo="¿Tienes preguntas sobre seguridad?" sub="Escríbenos y te contamos con detalle cómo tratamos tus datos." />
    </>
  );
}
