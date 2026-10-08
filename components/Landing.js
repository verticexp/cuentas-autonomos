import { Bricolage_Grotesque } from 'next/font/google';
import Logo from '@/components/Logo';
import Precios from '@/components/landing/Precios';
import Interacciones from '@/components/landing/Interacciones';
import '@/app/landing.css';

const fuente = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--f-web' });

const CONTACTO = 'mark.ramirez.2005@gmail.com';
const acceso = `mailto:${CONTACTO}?subject=${encodeURIComponent('Acceso a Netto')}`;

const PARA_QUIEN = [
  { t: 'Autónomos', d: 'Factura, declara y olvídate del papeleo. Desde 9 €/mes.', l: ['Verifactu y modelos 303, 130 y 100', 'Gastos con foto del ticket', 'Tu gestoría, con acceso de solo vista'] },
  { t: 'Pymes', d: 'Equipo, nóminas y banco en un solo sitio. Desde 25 €/mes.', l: ['Varios usuarios con permisos por área', 'Nóminas y registro de jornada', 'Conciliación y previsión de caja'] },
  { t: 'Grandes empresas', d: 'Muchas empresas, mucha gente, un solo panel. Desde 45 €/mes.', l: ['Hasta 40 empresas y usuarios ilimitados', 'Roles y accesos para gestorías', 'Incorporación guiada y soporte dedicado'] },
];

const PEQUENAS = ['Asistente IA con tus cifras', 'Varias empresas por cuenta', 'Importa desde Holded', 'Face ID y llaves de acceso', 'Avisos push de cobros', 'Se instala como app'];

const PREGUNTAS = [
  ['¿Puedo traer mis datos de otro programa?', 'Sí. Netto importa tus clientes y facturas desde Holded y desde archivos de otras plataformas, sin que tengas que volver a teclear nada.'],
  ['¿Puede Netto mover mi dinero?', 'No. La conexión con el banco es de solo lectura (PSD2, a través de Enable Banking): ve saldos y movimientos, nada más. Puedes desconectarla cuando quieras.'],
  ['¿Qué pasa cuando acaba la prueba?', 'Nada se borra. Eliges plan o te llevas tus datos: puedes exportar tus facturas y registros en cualquier momento.'],
  ['¿Puede mi gestoría entrar?', 'Sí. La invitas por email con un perfil de solo vista: ve facturas, gastos e impuestos, pero no puede marcar cobros ni tocar nada.'],
  ['¿Funciona en el móvil?', 'Se instala como app desde el navegador, con barra de pestañas en el móvil y panel lateral en el ordenador. La app para iPhone está en preparación.'],
  ['¿Puedo cambiar de plan?', 'Cuando quieras. Subes o bajas de plan y se ajusta a partir del siguiente periodo.'],
];

const Flecha = () => (
  <svg viewBox="0 0 16 16" className="web-flecha" aria-hidden><path d="M3 8h9m-3.5-4L12.5 8 8.5 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Tic = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Fija «arranque visto» (la pantalla de inicio es de la app, no de la web) y activa las apariciones al hacer scroll.
const PRE = "document.documentElement.dataset.arranque='visto';document.documentElement.classList.add('web-js')";

// Qué se ve en la ventana del hero: un cobro entra en el banco y Netto lo empareja con su factura.
function Ventana() {
  return (
    <div className="web-ventana" aria-hidden>
      <div className="wv-barra"><i /><i /><i /><span>nettohq.com</span></div>
      <div className="wv-saldo">
        <small>Saldo real · 3 cuentas</small>
        <strong>24.318,60 €</strong>
        <span className="wv-sube">+3.240 € este mes</span>
      </div>
      <ul className="wv-mov">
        <li style={{ '--d': '0.9s' }}><div><b>Sala Apolo</b><small>Transferencia · hoy</small></div><em className="mas">+1.210,00 €</em><span className="wv-ok">Factura F-0142 cobrada</span></li>
        <li style={{ '--d': '1.5s' }}><div><b>Backline Pro SL</b><small>Pago · ayer</small></div><em>−380,00 €</em><span className="wv-ok">Gasto pagado</span></li>
        <li style={{ '--d': '2.1s' }}><div><b>Eventos Lume</b><small>Transferencia · lunes</small></div><em className="mas">+640,00 €</em><span className="wv-ok">Factura F-0145 cobrada</span></li>
      </ul>
      <div className="wv-fila">
        <div className="wv-caja">
          <small>Previsión a 6 meses</small>
          <svg viewBox="0 0 120 40" preserveAspectRatio="none"><path className="wv-area" d="M0 32 C15 30 22 24 38 22 S62 20 76 13 S104 8 120 4 L120 40 L0 40Z" /><path className="wv-linea" d="M0 32 C15 30 22 24 38 22 S62 20 76 13 S104 8 120 4" /></svg>
        </div>
        <div className="wv-caja">
          <small>Apartar para el 303</small>
          <strong>2.184 €</strong>
        </div>
      </div>
      <p className="wv-ej">Datos de ejemplo</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className={`web ${fuente.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: PRE }} />
      <header className="web-cab">
        <a href="/" aria-label="Netto" className="web-marca"><Logo className="web-logo" /></a>
        <nav>
          <a href="#funciones">Funciones</a>
          <a href="#precios">Precios</a>
          <a href="#preguntas">Preguntas</a>
          <a className="web-entrar" href="/login">Entrar</a>
        </nav>
      </header>

      <section className="web-hero">
        <div className="web-hero-txt">
          <p className="web-sobre"><i />Autónomos, pymes y grandes empresas</p>
          <h1>Tus facturas, gastos e impuestos, <em>en orden</em>.</h1>
          <p className="web-sub">Factura, concilia con tu banco y sabe cuánto te queda de verdad. Una alternativa a Holded más sencilla, más barata y que se adapta a tu negocio.</p>
          <div className="web-cta">
            <a className="web-btn" href={acceso}>Pedir acceso <Flecha /></a>
            <a className="web-btn web-btn-claro" href="#precios">Ver precios</a>
          </div>
          <p className="web-micro">14 días sin tarjeta · Importa tus datos desde Holded</p>
        </div>
        <Ventana />
      </section>

      <section className="web-banda-conf" aria-label="Qué incluye">
        <span>Verifactu</span><span>Conexión bancaria PSD2</span><span>Modelos 303 · 130 · 100</span><span>Nóminas y jornada</span><span>Hecho en España</span>
      </section>

      <section id="funciones" className="web-seccion">
        <p className="web-kicker" data-r>Funciones</p>
        <h2 data-r>Todo lo que mueve tu negocio, en un solo sitio</h2>
        <div className="web-bento">
          <article data-foco data-r className="b-grande" style={{ '--d': '0ms' }}>
            <h3>Facturas y presupuestos que dan gusto enviar</h3>
            <p>Numeración correlativa, IVA e IRPF, plazo de cobro y recurrentes. Preparada para Verifactu, con huella encadenada y QR.</p>
            <div className="mini-factura" aria-hidden>
              <div><b>Factura F-0142</b><small>Sala Apolo · vence en 30 días</small></div>
              <div className="mf-lineas"><span /><span /><span /></div>
              <div className="mf-pie"><strong>1.210,00 €</strong><i className="mf-qr" /></div>
            </div>
          </article>
          <article data-foco data-r style={{ '--d': '70ms' }}>
            <h3>Gastos con IA</h3>
            <p>Foto al ticket o PDF: Netto rellena proveedor, base e IVA. Tú confirmas.</p>
            <div className="mini-ticket" aria-hidden><span /><span /><span /><i /></div>
          </article>
          <article data-foco data-r style={{ '--d': '140ms' }}>
            <h3>Banco y conciliación</h3>
            <p>Conexión PSD2 de solo lectura o extractos N43, CSV y Excel. Cada cobro se empareja con su factura.</p>
            <div className="mini-par" aria-hidden><b>+1.210 €</b><i /><b>F-0142</b></div>
          </article>
          <article data-foco data-r style={{ '--d': '0ms' }}>
            <h3>Impuestos al día</h3>
            <p>303, 130, 100 y más, con el pago fraccionado calculado. Sabes cuánto apartar antes del trimestre.</p>
            <div className="mini-modelos" aria-hidden><span>303</span><span>130</span><span>100</span></div>
          </article>
          <article data-foco data-r style={{ '--d': '70ms' }}>
            <h3>Previsión de caja</h3>
            <p>A 3, 6 y 12 meses con cobros, pagos, impuestos y nóminas, desde tu saldo real.</p>
            <svg className="mini-prev" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden><path d="M0 30 C18 28 24 22 40 20 S64 22 78 14 S104 10 120 5" /></svg>
          </article>
          <article data-foco data-r className="b-ancho" style={{ '--d': '140ms' }}>
            <h3>Equipo, nóminas y permisos</h3>
            <p>Empleados, nóminas y registro de jornada. Cada persona ve solo lo que debe: tu gestoría mira todo sin poder tocar cobros.</p>
            <div className="mini-permisos" aria-hidden>
              <div><span>Resumen</span><i className="on" /></div>
              <div><span>Facturar</span><i className="on" /></div>
              <div><span>Marcar cobros</span><i /></div>
              <div><span>Nóminas</span><i /></div>
            </div>
          </article>
        </div>
        <ul className="web-pildoras" data-r>{PEQUENAS.map((x) => <li key={x}><Tic />{x}</li>)}</ul>
      </section>

      <section className="web-seccion web-banda">
        <p className="web-kicker" data-r>Cómo funciona</p>
        <h2 data-r>Del banco a tus libros, sin teclear</h2>
        <ol>
          <li data-r style={{ '--d': '0ms' }}><strong>Conecta</strong> tu banco o sube el extracto.</li>
          <li data-r style={{ '--d': '80ms' }}><strong>Netto empareja</strong> cada cobro con su factura y cada pago con su gasto.</li>
          <li data-r style={{ '--d': '160ms' }}><strong>Confirmas</strong> y la factura queda cobrada con la fecha del banco.</li>
        </ol>
      </section>

      <section className="web-seccion">
        <p className="web-kicker" data-r>Para quién</p>
        <h2 data-r>Un plan para cada tamaño de negocio</h2>
        <div className="web-quien">
          {PARA_QUIEN.map((q, k) => (
            <article key={q.t} data-foco data-r style={{ '--d': `${k * 70}ms` }}>
              <h3>{q.t}</h3>
              <p>{q.d}</p>
              <ul>{q.l.map((x) => <li key={x}><Tic />{x}</li>)}</ul>
              <a className="web-enlace" href="#precios">Ver planes <Flecha /></a>
            </article>
          ))}
        </div>
      </section>

      <section id="precios" className="web-seccion">
        <p className="web-kicker" data-r>Precios</p>
        <h2 data-r>Precios claros, sin letra pequeña</h2>
        <Precios />
      </section>

      <section id="preguntas" className="web-seccion web-faq">
        <p className="web-kicker" data-r>Preguntas</p>
        <h2 data-r>Preguntas frecuentes</h2>
        <div data-r>
          {PREGUNTAS.map(([q, a]) => (
            <details key={q}><summary>{q}<svg viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="web-final" data-r>
        <h2>Empieza a ver tu dinero con claridad</h2>
        <p>14 días sin tarjeta. Sin permanencia.</p>
        <a className="web-btn" href={acceso}>Pedir acceso <Flecha /></a>
      </section>

      <footer className="web-pie">
        <Logo className="web-logo" />
        <p><a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a> · <a href={`mailto:${CONTACTO}`}>Contacto</a> · <a href="/login">Entrar</a></p>
        <p>© {new Date().getFullYear()} Netto · nettohq.com</p>
      </footer>
      <Interacciones />
    </div>
  );
}
