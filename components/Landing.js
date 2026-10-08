import Logo from '@/components/Logo';
import '@/app/landing.css';

const CONTACTO = 'mark.ramirez.2005@gmail.com';
const acceso = `mailto:${CONTACTO}?subject=${encodeURIComponent('Acceso a Netto')}`;

const FUNCIONES = [
  { t: 'Facturas y presupuestos', d: 'Numeración correlativa, IVA e IRPF, plazo de cobro, recurrentes y una plantilla cuidada. Preparada para Verifactu: huella encadenada y QR.' },
  { t: 'Gastos con IA', d: 'Haz una foto al ticket o sube el PDF y Netto rellena proveedor, base e IVA. Tú solo confirmas.' },
  { t: 'Banco conectado', d: 'Conexión PSD2 de solo lectura con tu banco, o sube el extracto en Norma 43, CSV o Excel. Saldo real de todas tus cuentas.' },
  { t: 'Conciliación automática', d: 'Empareja cobros con facturas y pagos con gastos por importe, número o nombre. Se confirma de uno en uno o todo de golpe, y se puede deshacer.' },
  { t: 'Impuestos y modelos', d: 'Cálculo del 303, 130, 100 y más, con el pago fraccionado al día. Sabes cuánto apartar antes de que llegue el trimestre.' },
  { t: 'Previsión de caja', d: 'A 3, 6 y 12 meses, con cobros, pagos, impuestos y nóminas, partiendo de tu saldo real.' },
  { t: 'Equipo y nóminas', d: 'Empleados, nóminas y registro de jornada en la misma cuenta que tu contabilidad.' },
  { t: 'Varias actividades y empresas', d: 'Cada actividad con su IVA e IRPF. Usuarios con permisos por área: tu gestoría ve todo sin poder tocar cobros.' },
];

const PLANES = [
  { n: 'Autónomo', p: 9, para: 'Para empezar a facturar en orden', l: ['Facturas, presupuestos y gastos', 'Modelos de impuestos', 'Verifactu', '1 empresa', 'Escaneo de gastos con IA'] },
  { n: 'Pro', p: 19, para: 'Para controlar el dinero de verdad', destacado: true, l: ['Todo lo de Autónomo', 'Banco con conciliación', 'Previsión de caja', 'Multiactividad', 'Acceso para tu gestoría con permisos'] },
  { n: 'Equipo', p: 35, para: 'Para pymes y empresas con plantilla', l: ['Todo lo de Pro', 'Nóminas', 'Registro de jornada', 'Varios usuarios y roles'] },
];

const PREGUNTAS = [
  ['¿Puedo traer mis datos de otro programa?', 'Sí. Netto importa tus clientes y facturas desde Holded y desde archivos de otras plataformas.'],
  ['¿Puede Netto mover mi dinero?', 'No. La conexión con el banco es solo de lectura (PSD2, a través de Enable Banking): ve saldos y movimientos, nada más. Puedes desconectarla cuando quieras.'],
  ['¿Sirve para mi gestoría?', 'Sí. Invítala por email con un perfil de solo vista: ve facturas, gastos e impuestos pero no puede marcar cobros.'],
  ['¿Funciona en el móvil?', 'Se instala como app desde el navegador, con barra de pestañas en el móvil y panel lateral en el ordenador. La app para iPhone está en preparación.'],
];

// Fija «arranque visto» antes de hidratar: la pantalla de inicio es de la app, no de la web pública.
const SIN_ARRANQUE = "document.documentElement.dataset.arranque='visto'";

export default function Landing() {
  return (
    <div className="web">
      <script dangerouslySetInnerHTML={{ __html: SIN_ARRANQUE }} />
      <header className="web-cab">
        <a href="/" aria-label="Netto"><Logo className="web-logo" /></a>
        <nav>
          <a href="#funciones">Funciones</a>
          <a href="#precios">Precios</a>
          <a href="#preguntas">Preguntas</a>
          <a className="web-entrar" href="/login">Entrar</a>
        </nav>
      </header>

      <section className="web-hero">
        <p className="web-sobre">Gestión financiera para autónomos y empresas</p>
        <h1>Tus facturas, gastos e impuestos, <em>en orden</em>.</h1>
        <p className="web-sub">Factura, concilia con tu banco y sabe cuánto te queda de verdad. Una alternativa a Holded más sencilla, más barata y que se adapta a tu negocio.</p>
        <div className="web-cta">
          <a className="web-btn" href={acceso}>Pedir acceso · 14 días sin tarjeta</a>
          <a className="web-btn web-btn-claro" href="/login">Ya tengo cuenta</a>
        </div>
      </section>

      <section id="funciones" className="web-seccion">
        <h2>Todo lo que mueve tu negocio, en un sitio</h2>
        <div className="web-rejilla">
          {FUNCIONES.map((f) => (
            <article key={f.t}><h3>{f.t}</h3><p>{f.d}</p></article>
          ))}
        </div>
      </section>

      <section className="web-seccion web-banda">
        <h2>Del banco a tus libros, sin teclear</h2>
        <ol>
          <li><strong>Conecta</strong> tu banco o sube el extracto.</li>
          <li><strong>Netto empareja</strong> cada cobro con su factura y cada pago con su gasto.</li>
          <li><strong>Confirmas</strong> y la factura queda cobrada con la fecha del banco.</li>
        </ol>
      </section>

      <section id="precios" className="web-seccion">
        <h2>Precios claros, sin IVA</h2>
        <p className="web-nota">Prueba de 14 días sin tarjeta. Precio de fundador para los primeros usuarios. Pagando al año, ahorras un 30 %.</p>
        <div className="web-planes">
          {PLANES.map((p) => (
            <article key={p.n} className={p.destacado ? 'web-plan web-plan-fuerte' : 'web-plan'}>
              <h3>{p.n}</h3>
              <p className="web-para">{p.para}</p>
              <p className="web-precio"><strong>{p.p} €</strong> /mes</p>
              <ul>{p.l.map((x) => <li key={x}>{x}</li>)}</ul>
              <a className="web-btn" href={acceso}>Pedir acceso</a>
            </article>
          ))}
        </div>
      </section>

      <section id="preguntas" className="web-seccion web-faq">
        <h2>Preguntas frecuentes</h2>
        {PREGUNTAS.map(([q, a]) => (
          <details key={q}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </section>

      <section className="web-final">
        <h2>Empieza a ver tu dinero con claridad</h2>
        <a className="web-btn" href={acceso}>Pedir acceso</a>
      </section>

      <footer className="web-pie">
        <Logo className="web-logo" />
        <p><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a> · <a href={`mailto:${CONTACTO}`}>Contacto</a></p>
        <p>© {new Date().getFullYear()} Netto · nettohq.com</p>
      </footer>
    </div>
  );
}
