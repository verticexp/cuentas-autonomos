import Link from 'next/link';
import Icono from '@/components/web/Icono';
import { Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';

export const metadata = { title: 'Seguridad · Fisquo', description: 'Cómo protege Fisquo tus datos: tú decides quién entra, copia cifrada cada noche, conexión cifrada y sin vender tus datos ni usarlos para entrenar IA.' };

// Lo que pregunta el dueño del negocio, en lenguaje llano y solo con lo que es cierto (auditoría D1-36): la copia, en
// .github/workflows/copia.yml (cada noche, cifrada, 90 días); los servidores, en vercel.json (fra1); lo de la IA, en la
// política de privacidad. Lo técnico va abajo, en «Detalles técnicos».
const MEDIDAS = [
  { i: 'equipo', t: 'Tú decides quién entra', d: 'Cada persona ve solo lo que necesita: facturas, gastos, nóminas… Tu gestoría ve tus facturas y gastos sin poder tocarlos.' },
  { i: 'candado', t: 'Face ID, huella o llave de acceso', d: 'Además de tu contraseña, puedes bloquear Fisquo en el móvil y abrirlo con tu cara, tu huella o una llave de acceso.' },
  { i: 'escudo', t: 'Copia de seguridad cada noche', d: 'Cada noche se hace una copia cifrada de todos los datos, que se guarda 90 días.' },
  { i: 'llave', t: 'Todo viaja cifrado', d: 'Lo que envías y recibes va siempre cifrado. La app funciona en servidores de Fráncfort (Alemania).' },
  { i: 'documento', t: 'Tus datos no se venden', d: 'Ni publicidad ni perfiles, y no se usan para entrenar inteligencia artificial. La IA solo lee lo que tú le das: los tickets que subes y lo que le preguntas.' },
  { i: 'correo', t: 'Invitaciones que caducan', d: 'Las invitaciones a tu equipo valen 7 días y una sola vez.' },
];
const TECNICO = [
  ['¿Cómo se protege la conexión?', 'Fisquo solo funciona por HTTPS, con HSTS: tu navegador nunca se conecta sin cifrar.'],
  ['¿Y si alguien intenta hacer algo en mi nombre desde otra web?', 'Todas las acciones que cambian datos se comprueban para que solo puedan venir de la propia app (protección contra CSRF).'],
  ['¿Qué pasa con los archivos que subo y descargo?', 'Los Excel que subes se revisan antes de abrirlos para frenar archivos manipulados, y los CSV que descargas no pueden ejecutar fórmulas. Los enlaces de Fisquo no se filtran a otras webs.'],
];

export default function Seguridad() {
  return (
    <>
      <section className="web-hero-pag centro">
        <span className="web-fcard-ico grande web-entra"><Icono n="escudo" /></span>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Tus números son tuyos. <em>Y están a salvo.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Tus facturas, tu equipo y tus impuestos son lo más delicado de tu negocio. Así los protege Fisquo.</p>
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
        <Encabezado kicker="Banco" titulo="Tu banco, sin darnos las llaves" sub="Ahora trabajas con extractos que tú descargas y subes. Fisquo extrae los movimientos y te ayuda a conciliarlos, sin pedirte las claves de tu banca online. La conexión directa está prevista para más adelante y será de solo lectura." />
      </section>

      <Faq titulo="Detalles técnicos" preguntas={TECNICO} />

      <Cta titulo="¿Tienes preguntas sobre seguridad?" sub="Escríbenos y te contamos con detalle cómo tratamos tus datos." otro={['/contacto', 'Escríbenos']} />
    </>
  );
}
