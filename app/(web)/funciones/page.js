import Link from 'next/link';
import Icono from '@/components/web/Icono';
import Pantalla from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Flecha } from '@/components/web/Bloques';
import { EXTRAS, FUNCIONES, PROXIMAMENTE } from '@/components/web/datos';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

export async function generateMetadata() {
  const tr = await textos();
  return { title: tr('Funciones · Fisquo'), description: tr('Facturación con Verifactu, gastos con IA, impuestos, contabilidad y cuentas anuales, inventario, conciliación de extractos, previsión de caja, nóminas y asistente IA.') };
}

// «Ver» + el nombre en minúsculas, como siempre (en castellano también «ia»): cada texto entero para que cada idioma lo escriba a su manera.
const VER = { facturacion: 'Ver facturación', gastos: 'Ver gastos con ia', impuestos: 'Ver impuestos y modelos', contabilidad: 'Ver contabilidad', inventario: 'Ver inventario', banco: 'Ver banco y conciliación', tesoreria: 'Ver tesorería', equipo: 'Ver equipo y nóminas', asistente: 'Ver asistente ia' };

const VISUAL = { facturacion: 'factura', gastos: 'gasto', impuestos: 'impuestos', contabilidad: 'contabilidad', inventario: 'inventario', banco: 'conciliacion', tesoreria: 'prevision', equipo: 'equipo', asistente: null };

export default async function Funciones() {
  const tr = await textos();
  return (
    <>
      <section className="web-hero-pag">
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{conHuecos(tr('Todo lo que necesitas para llevar tus cuentas. {resalte}'), { resalte: <em>{tr('Nada que te sobre.')}</em> })}</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{tr('Nueve áreas que trabajan juntas: lo que facturas, gastas y cobras alimenta tus impuestos, tu contabilidad, tu stock y tu previsión de caja sin que tengas que pasar nada a mano.')}</p>
        <nav className="web-indice web-entra" style={{ '--d': '180ms' }} aria-label={tr('Funciones')}>
          {FUNCIONES.map((f) => <Link key={f.slug} href={`/funciones/${f.slug}`}><Icono n={f.icono} />{tr(f.nombre)}</Link>)}
        </nav>
      </section>

      <section className="web-sec">
        <div className="web-filas">
          {FUNCIONES.map((f, i) => (
            <article key={f.slug} className={`web-fila${i % 2 ? ' invertida' : ''}`}>
              <div className="web-fila-txt" data-r>
                <h2>{tr(f.titulo)}</h2>
                <p>{tr(f.sub)}</p>
                <ul className="web-lista">{f.puntos.map((p) => <li key={p.t}><Icono n="tic" /><span><b>{tr(p.t)}.</b> {tr(p.d)}</span></li>)}</ul>
                <Link href={`/funciones/${f.slug}`} className="web-btn web-btn-oscuro">{tr(VER[f.slug])}<Flecha /></Link>
              </div>
              <div className="web-fila-vis" data-r style={{ '--d': '100ms' }}>
                <div className="web-marco-vis">{VISUAL[f.slug] ? <Pantalla tipo={VISUAL[f.slug]} /> : <ChatEstatico tr={tr} />}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado titulo="Los detalles que marcan la diferencia" />
        <div className="web-extras">
          {EXTRAS.map((x, i) => (
            <div key={x.t} data-foco data-r style={{ '--d': `${(i % 3) * 60}ms` }}>
              <b>{tr(x.t)}</b><p>{tr(x.d)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec web-oscura">
        <Encabezado titulo="En lo que estamos trabajando" sub="Fisquo mejora cada semana. Esto es lo próximo que llega." claro />
        <ol className="web-hoja">
          {PROXIMAMENTE.map((x, i) => (
            <li key={x.t} data-r style={{ '--d': `${i * 70}ms` }}><span className="web-hoja-punto" /><b>{tr(x.t)}</b><p>{tr(x.d)}</p></li>
          ))}
        </ol>
      </section>

      <Cta />
    </>
  );
}

function ChatEstatico({ tr }) {
  return (
    <div className="mk mk-chat" aria-hidden>
      <p className="yo">{tr('¿Quién me debe más dinero?')}</p>
      <p>{tr('Altamira Consultores: 2 facturas pendientes por 2.270 €. La F-0137 venció hace 9 días.')}</p>
      <p className="yo">{tr('¿Y cuánto IVA pagaré este trimestre?')}</p>
      <p>{tr('Tu 303 del tercer trimestre sale a 1.842,30 €.')}</p>
    </div>
  );
}
