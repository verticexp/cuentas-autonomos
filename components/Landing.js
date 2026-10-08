import Link from 'next/link';
import Marco from '@/components/web/Marco';
import Icono from '@/components/web/Icono';
import Precios from '@/components/web/Precios';
import Tour from '@/components/web/demos/Tour';
import { Calculadora } from '@/components/web/demos/Demos';
import { VentanaApp } from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';
import { FAQ_GENERAL, FUNCIONES, SEGMENTOS } from '@/components/web/datos';

const CINTA = ['Facturas ilimitadas', 'Verifactu', 'Presupuestos online', 'Gastos con IA', 'Modelo 303', 'Modelo 130', 'Modelos 111 y 115', 'Renta (100)', 'Conciliación de extractos', 'Previsión de caja', 'Nóminas', 'Registro de jornada', 'Permisos por área', 'Varias empresas', 'Portal del cliente', 'Asistente IA', 'Importa desde Holded', 'Face ID'];

const CIFRAS = [
  { n: 9, suf: ' €', t: 'al mes, desde', d: 'Sin cuotas de alta ni permanencia' },
  { n: 14, suf: ' días', t: 'de prueba gratis', d: 'Sin dar ninguna tarjeta' },
  { n: 100, suf: '', t: 'tickets al día con IA', d: 'Por usuario, incluidos en tu plan' },
  { n: 5, suf: ' modelos', t: 'fiscales calculados', d: '303, 130, 111, 115 y 100' },
];

// Web pública de nettohq.com: lo que ve en / quien aún no ha entrado.
export default function Landing() {
  return (
    <Marco>
      <section className="web-hero">
        <div className="web-hero-txt">
          <Link href="/funciones/impuestos" className="web-aviso"><span>Nuevo</span>Calcula tus modelos 303 y 130 al momento<Icono n="flecha" className="ico web-flecha" /></Link>
          <h1>Las cuentas de tu negocio, <em>por fin en orden</em>.</h1>
          <p className="web-sub">Facturas, gastos con IA, impuestos, caja y equipo en una sola app. La alternativa a Holded más sencilla y más barata, para autónomos, pymes y grandes empresas.</p>
          <div className="web-cta">
            <Link className="web-btn web-btn-grande" href="/contacto">Empieza gratis<Flecha /></Link>
            <Link className="web-btn web-btn-claro web-btn-grande" href="/funciones">Ver cómo funciona</Link>
          </div>
          <ul className="web-micro"><li><Icono n="tic" />14 días sin tarjeta</li><li><Icono n="tic" />Importa desde Holded</li><li><Icono n="tic" />Preparada para Verifactu</li></ul>
        </div>
        <div className="web-hero-vis">
          <VentanaApp />
          <div className="web-flota f1" aria-hidden><span className="web-flota-ico ok"><Icono n="tic" /></span><div><b>Factura F-0142 cobrada</b><small>+1.210,00 € · Sala Apolo</small></div></div>
          <div className="web-flota f2" aria-hidden><span className="web-flota-ico"><Icono n="asistente" /></span><div><b>Ticket leído con IA</b><small>Backline Pro SL · 380,00 €</small></div></div>
          <div className="web-flota f3" aria-hidden><span className="web-flota-ico imp"><Icono n="impuestos" /></span><div><b>Aparta 3.347 €</b><small>Modelos del 3.er trimestre</small></div></div>
        </div>
      </section>

      <div className="web-cinta" aria-label="Qué incluye Netto">
        <div className="web-cinta-pista">{[...CINTA, ...CINTA].map((x, i) => <span key={i} aria-hidden={i >= CINTA.length}>{x}</span>)}</div>
      </div>

      <section className="web-sec">
        <div className="web-cifras">
          {CIFRAS.map((c, i) => (
            <div key={c.t} data-r style={{ '--d': `${i * 70}ms` }}>
              <b><span data-contar={c.n}>{c.n}</span>{c.suf}</b>
              <p>{c.t}</p><small>{c.d}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="El producto" titulo="Todo tu negocio, en una sola app" sub="Deja de saltar entre Excel, el correo y la web del banco. Netto junta lo que mueve tu dinero y lo pone en orden." centro />
        <div data-r><Tour /></div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Funciones" titulo="Hecho para lo que de verdad te quita tiempo" />
        <div className="web-funciones">
          {FUNCIONES.map((f, i) => (
            <Link key={f.slug} href={`/funciones/${f.slug}`} data-foco data-r className={`web-fcard${i === 0 || i === 3 ? ' ancha' : ''}`} style={{ '--d': `${(i % 3) * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n={f.icono} /></span>
              <h3>{f.nombre}</h3>
              <p>{f.sub}</p>
              <span className="web-enlace">Descubrir<Flecha /></span>
            </Link>
          ))}
          <Link href="/funciones" data-foco data-r className="web-fcard web-fcard-todas" style={{ '--d': '140ms' }}>
            <h3>Y mucho más</h3>
            <p>Portal del cliente, copia en Google Drive, Face ID, avisos push, varias empresas…</p>
            <span className="web-enlace">Ver todas las funciones<Flecha /></span>
          </Link>
        </div>
      </section>

      <section className="web-sec web-oscura">
        <Encabezado kicker="Pruébalo ahora" titulo="¿Cuánto tienes que apartar este trimestre?" sub="Mueve los importes y mira tu IVA y tu IRPF al momento. En Netto se calcula solo con tus facturas y gastos reales." centro claro />
        <div data-r><Calculadora /></div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Para quién" titulo="Crece sin cambiar de herramienta" sub="Empieza como autónomo y sigue con Netto cuando contrates a tu primer empleado o abras tu segunda empresa." />
        <div className="web-segs">
          {SEGMENTOS.map((s, i) => (
            <Link key={s.id} href={s.ruta} data-foco data-r className="web-segcard" style={{ '--d': `${i * 80}ms` }}>
              <span className="web-fcard-ico"><Icono n={s.icono} /></span>
              <small>Desde {s.desde} €/mes</small>
              <h3>{s.n}</h3>
              <p>{s.sub}</p>
              <ul>{s.dolores.slice(0, 3).map(([, sol]) => <li key={sol}><Icono n="tic" />{sol}</li>)}</ul>
              <span className="web-enlace">Netto para {s.n.toLowerCase()}<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">Cambiarte es fácil</p>
            <h2>¿Vienes de Holded? Trae tus datos en minutos</h2>
            <p>Importa tus clientes y facturas desde Holded o desde archivos de otras plataformas. Sin volver a teclear nada y sin perder tu historial.</p>
            <Link href="/contacto" className="web-btn">Quiero cambiarme<Flecha /></Link>
          </div>
          <ol>
            <li><b>Exporta</b><span>Descarga tus datos desde tu programa actual.</span></li>
            <li><b>Importa</b><span>Súbelos a Netto: reconoce clientes y facturas solo.</span></li>
            <li><b>Sigue facturando</b><span>Con tu numeración y tu historial, donde lo dejaste.</span></li>
          </ol>
        </div>
      </section>

      <section className="web-sec" id="precios">
        <Encabezado kicker="Precios" titulo="Un precio claro para cada tamaño" sub="Sin cuotas de alta, sin permanencia y con 14 días para probarlo todo." centro />
        <Precios />
        <p className="web-centro"><Link href="/precios" className="web-enlace">Comparar todos los planes en detalle<Flecha /></Link></p>
      </section>

      <Faq preguntas={FAQ_GENERAL} />
      <Cta />
    </Marco>
  );
}
