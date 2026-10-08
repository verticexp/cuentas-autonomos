import Link from 'next/link';
import Icono from '@/components/web/Icono';
import Pantalla from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Flecha } from '@/components/web/Bloques';
import { EXTRAS, FUNCIONES, PROXIMAMENTE } from '@/components/web/datos';

export const metadata = { title: 'Funciones · Netto', description: 'Facturación con Verifactu, gastos con IA, impuestos, conciliación de extractos, previsión de caja, nóminas y asistente IA.' };

const VISUAL = { facturacion: 'factura', gastos: 'gasto', impuestos: 'impuestos', banco: 'conciliacion', tesoreria: 'prevision', equipo: 'equipo', asistente: null };

export default function Funciones() {
  return (
    <>
      <section className="web-hero-pag">
        <p className="web-kicker web-entra">Funciones</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Todo lo que necesitas para llevar tus cuentas. <em>Nada que te sobre.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Siete áreas que trabajan juntas: lo que facturas, gastas y cobras alimenta tus impuestos y tu previsión de caja sin que tengas que pasar nada a mano.</p>
        <nav className="web-indice web-entra" style={{ '--d': '180ms' }} aria-label="Funciones">
          {FUNCIONES.map((f) => <Link key={f.slug} href={`/funciones/${f.slug}`}><Icono n={f.icono} />{f.nombre}</Link>)}
        </nav>
      </section>

      <section className="web-sec">
        <div className="web-filas">
          {FUNCIONES.map((f, i) => (
            <article key={f.slug} className={`web-fila${i % 2 ? ' invertida' : ''}`}>
              <div className="web-fila-txt" data-r>
                <span className="web-fcard-ico"><Icono n={f.icono} /></span>
                <h2>{f.titulo}</h2>
                <p>{f.sub}</p>
                <ul className="web-lista">{f.puntos.map((p) => <li key={p.t}><Icono n="tic" /><span><b>{p.t}.</b> {p.d}</span></li>)}</ul>
                <Link href={`/funciones/${f.slug}`} className="web-btn web-btn-oscuro">Ver {f.nombre.toLowerCase()}<Flecha /></Link>
              </div>
              <div className="web-fila-vis" data-r style={{ '--d': '100ms' }}>
                <div className="web-marco-vis">{VISUAL[f.slug] ? <Pantalla tipo={VISUAL[f.slug]} /> : <ChatEstatico />}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Y además" titulo="Los detalles que marcan la diferencia" />
        <div className="web-extras">
          {EXTRAS.map((x, i) => (
            <div key={x.t} data-foco data-r style={{ '--d': `${(i % 3) * 60}ms` }}>
              <span className="web-fcard-ico peq"><Icono n={x.icono} /></span>
              <b>{x.t}</b><p>{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec web-oscura">
        <Encabezado kicker="Próximamente" titulo="En lo que estamos trabajando" sub="Netto mejora cada semana. Esto es lo próximo que llega." claro />
        <ol className="web-hoja">
          {PROXIMAMENTE.map((x, i) => (
            <li key={x.t} data-r style={{ '--d': `${i * 70}ms` }}><span className="web-hoja-punto" /><b>{x.t}</b><p>{x.d}</p></li>
          ))}
        </ol>
      </section>

      <Cta />
    </>
  );
}

function ChatEstatico() {
  return (
    <div className="mk mk-chat" aria-hidden>
      <p className="yo">¿Quién me debe más dinero?</p>
      <p>Sala Apolo: 2 facturas pendientes por 2.270 €. La F-0137 venció hace 9 días.</p>
      <p className="yo">¿Y cuánto IVA pagaré este trimestre?</p>
      <p>Tu 303 del tercer trimestre sale a 1.842,30 €.</p>
    </div>
  );
}
