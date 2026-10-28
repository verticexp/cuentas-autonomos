import CintaFunciones from '@/components/web/CintaFunciones';
import Link from '@/components/web/EnlacePublico';
import Marco from '@/components/web/Marco';
import Icono from '@/components/web/Icono';
import Precios from '@/components/web/Precios';
import PruebaSocial from '@/components/web/PruebaSocial';
import Tour from '@/components/web/demos/Tour';
import { Calculadora } from '@/components/web/demos/Demos';
import { VentanaApp } from '@/components/web/demos/Pantallas';
import { Confianza, Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';
import { GUIAS } from '@/data/web-guias';
import { FAQ_GENERAL, FUNCIONES, SEGMENTOS } from '@/components/web/datos';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

const CINTA = ['Facturas ilimitadas', 'Verifactu', 'Presupuestos online', 'Gastos con IA', 'Modelo 303', 'Modelo 130', 'Modelos 111 y 115', 'Modelos 390, 347 y 349', 'Impuesto de Sociedades', 'Renta (100)', 'Conciliación de extractos', 'Libros registro (formato AEAT)', 'Contabilidad por partida doble', 'Balance y resultados', 'Amortizaciones', 'Cuentas anuales', 'Inventario y stock', 'Previsión de caja', 'Nóminas', 'Registro de jornada', 'Permisos por área', 'Varias empresas', 'Portal del cliente', 'Asistente IA', 'Cámbiate desde Holded, A3 o Sage', 'Face ID'];

const CIFRAS = [
  { pre: 'desde', n: 9, suf: ' €', t: 'al mes', d: 'Sin cuotas de alta ni permanencia' },
  { n: 30, suf: ' días', t: 'de prueba gratis', d: 'Sin dar ninguna tarjeta' },
  { pre: 'desde', n: 50, suf: '', t: 'tickets al mes leídos con IA', d: 'En foto o PDF; hasta 1.500 según el plan' },
  { n: 12, suf: '', t: 'modelos fiscales calculados', d: '303, 130, 111, 390, 347, Sociedades…' },
];

// Web pública de fisquo.com: lo que ve en / quien aún no ha entrado.
// Las cuatro guías de la portada: dos para todos, una de autónomos y una de sociedades.
const PORTADA_GUIAS = ['modelo-303', 'modelo-130', 'impuesto-sociedades-200-202', 'retenciones-111-115-190-180'];

export default async function Landing() {
  const tr = await textos();
  return (
    <Marco>
      <section className="web-hero">
        <div className="web-hero-txt">
          <Link href="/funciones/facturacion" className="web-aviso"><span>Verifactu</span>{tr('Tus facturas, preparadas')}<i className="web-solo-ancho">{` ${tr('para la nueva normativa')}`}</i><Icono n="flecha" className="ico web-flecha" /></Link>
          <h1>{conHuecos(tr('Las cuentas de tu negocio, {resalte}.'), { resalte: <em>{tr('por fin en orden')}</em> })}</h1>
          <p className="web-sub">{tr('Haz tus facturas, apunta los gastos con una foto y sabrás cada trimestre cuánto pagar a Hacienda. Para autónomos y pymes, desde 9 € al mes + IVA.')}</p>
          <div className="web-cta">
            <Link className="web-btn web-btn-grande" href="/registro">{tr('Empieza gratis')}<Flecha /></Link>
            <Link className="web-btn web-btn-claro web-btn-grande" href="/funciones"><span><span className="web-solo-ancho">{tr('Ver cómo')}</span><span className="web-solo-movil">{tr('Cómo')}</span>{` ${tr('funciona')}`}</span></Link>
            <Link className="web-hero-demo" href="/demo">{tr('Ver la demo sin registrarte')}<Flecha /></Link>
          </div>
          <ul className="web-micro"><li><Icono n="tic" />{tr('30 días gratis, sin tarjeta')}</li><li><Icono n="tic" />{tr('Sin permanencia')}</li><li><Icono n="tic" />{tr('Tu gestoría entra gratis')}</li></ul>
        </div>
        <div className="web-hero-vis">
          <VentanaApp />
          <div className="web-flota f1" aria-hidden><span className="web-flota-ico ok"><Icono n="tic" /></span><div><b>{tr('Factura F-0141 cobrada')}</b><small>+640,00 € · Estudio Norte</small></div></div>
          <div className="web-flota f2" aria-hidden><span className="web-flota-ico"><Icono n="asistente" /></span><div><b>{tr('Ticket leído con IA')}</b><small>Suministros Vega SL · 380,00 €</small></div></div>
          <div className="web-flota f3" aria-hidden><span className="web-flota-ico imp"><Icono n="impuestos" /></span><div><b>{tr('Aparta 3.347 €')}</b><small>{tr('Modelos del 3.er trimestre')}</small></div></div>
        </div>
      </section>

      <CintaFunciones items={CINTA.map((x) => tr(x))} />

      <section className="web-sec">
        <div className="web-cifras">
          {CIFRAS.map((c, i) => (
            <div key={c.t} data-r style={{ '--d': `${i * 70}ms` }}>
              <b>{c.pre && <i>{tr(c.pre)}</i>}<span data-contar={c.n}>{c.n.toLocaleString('es-ES', { useGrouping: 'always' })}</span>{c.suf && `${c.suf.startsWith(' ') ? ' ' : ''}${tr(c.suf.trim())}`}</b>
              <p>{tr(c.t)}</p><small>{tr(c.d)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="El producto" titulo="Todo tu negocio, en una sola app" sub="Deja de saltar entre Excel, el correo y la web del banco. Fisquo junta lo que mueve tu dinero y lo pone en orden." centro />
        <div data-r="vis"><Tour /></div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Funciones" titulo="Hecho para lo que de verdad te quita tiempo" />
        <div className="web-funciones web-carrusel">
          {FUNCIONES.map((f, i) => (
            <Link key={f.slug} href={`/funciones/${f.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${(i % 3) * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n={f.icono} /></span>
              <h3>{tr(f.nombre)}</h3>
              <p>{tr(f.sub)}</p>
              <span className="web-enlace">{tr('Descubrir')}<Flecha /></span>
            </Link>
          ))}
          <Link href="/funciones" data-foco data-r className="web-fcard web-fcard-todas" style={{ '--d': '140ms' }}>
            <h3>{tr('Y mucho más')}</h3>
            <p>{tr('Cuentas anuales, portal del cliente, copia en Google Drive, Face ID, avisos push, varias empresas…')}</p>
            <span className="web-enlace">{tr('Ver todas las funciones')}<Flecha /></span>
          </Link>
        </div>
      </section>

      <section className="web-sec web-oscura">
        <Encabezado kicker="Pruébalo ahora" titulo="¿Cuánto tienes que apartar este trimestre?" sub="Mueve los importes y mira tu IVA y tu IRPF al momento. En Fisquo se calcula solo con tus facturas y gastos reales." centro claro />
        <div data-r="vis"><Calculadora /></div>
      </section>

      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">{tr('Con tu gestoría')}</p>
            <h2>{tr('Fisquo calcula. Tú o tu gestoría revisáis y presentáis.')}</h2>
            <p>{tr('Fisquo no sustituye a tu gestoría: le deja el trabajo hecho. Entra gratis con su propio acceso y ve tus facturas, gastos e impuestos sin poder tocarlos. Y si ya trabaja con Fisquo, con su código tienes 3 meses de prueba.')}</p>
            <Link href="/gestorias" className="web-btn">{tr('¿Eres gestoría? Trabaja con nosotros')}<Flecha /></Link>
          </div>
          <ol>
            <li><b>{tr('Tú apuntas')}</b><span>{tr('Facturas y gastos durante el trimestre, con una foto del ticket.')}</span></li>
            <li><b>{tr('Tu gestoría revisa')}</b><span>{tr('Lo encuentra todo ordenado, sin perseguir papeles.')}</span></li>
            <li><b>{tr('Se presenta como siempre')}</b><span>{tr('Con los modelos ya calculados y sin sustos de última hora.')}</span></li>
          </ol>
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Para quién" titulo="Crece sin cambiar de herramienta" sub="Empieza como autónomo y sigue con Fisquo cuando contrates a tu primer empleado o abras tu segunda empresa." />
        <div className="web-segs web-carrusel">
          {SEGMENTOS.map((s, i) => (
            <Link key={s.id} href={s.ruta} data-foco data-r className="web-segcard" style={{ '--d': `${i * 80}ms` }}>
              <span className="web-fcard-ico"><Icono n={s.icono} /></span>
              <small>{s.id === 'business' ? tr('Propuesta a medida') : tr('Desde {desde} €/mes sin IVA', { desde: s.desde })}</small>
              <h3>{tr(s.n)}</h3>
              <p>{tr(s.sub)}</p>
              <ul>{s.dolores.slice(0, 3).map(([, sol]) => <li key={sol}><Icono n="tic" />{tr(sol)}</li>)}</ul>
              <span className="web-enlace">{s.id === 'business' ? tr('Conoce Fisquo Business') : tr('Fisquo para {tipo}', { tipo: tr(s.n.toLowerCase()) })}<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">{tr('Cambiarte es fácil')}</p>
            <h2>{tr('¿Vienes de Holded, A3 o Sage? Trae tus datos en minutos')}</h2>
            <p>{tr('Importa clientes, facturas y gastos, y también tu contabilidad: el balance de sumas y saldos y los bienes de inversión con lo ya amortizado. Sin volver a teclear nada y sin perder tu historial.')}</p>
            <Link href="/contacto" className="web-btn">{tr('Quiero cambiarme')}<Flecha /></Link>
            <p className="web-mudanza-mas"><Link href="/comparativa" className="web-enlace">{tr('Fisquo frente a Holded y Quipu')}<Flecha /></Link></p>
          </div>
          <ol>
            <li><b>{tr('Exporta')}</b><span>{tr('Descarga tus datos desde tu programa actual.')}</span></li>
            <li><b>{tr('Importa')}</b><span>{tr('Súbelos a Fisquo: reconoce clientes, facturas, saldos y bienes solo.')}</span></li>
            <li><b>{tr('Sigue donde lo dejaste')}</b><span>{tr('Con tu numeración, tu historial y la contabilidad abierta.')}</span></li>
          </ol>
        </div>
      </section>

      <PruebaSocial />

      <Confianza />

      <section className="web-sec" id="precios">
        <Encabezado kicker="Precios" titulo="Un precio claro para cada tamaño" sub="Sin cuotas de alta, sin permanencia y con un mes para probarlo todo." centro />
        <Precios />
        <p className="web-centro"><Link href="/precios" className="web-enlace">{tr('Comparar todos los planes en detalle')}<Flecha /></Link></p>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Guías fiscales" titulo="Entiende tus impuestos antes de presentarlos" sub="Guías con la norma citada y la fecha de revisión, para autónomos y para sociedades: IVA, IRPF, Impuesto sobre Sociedades, retenciones, cuentas anuales y calendarios." />
        <div className="web-relacionadas cuatro">
          {PORTADA_GUIAS.map((slug) => GUIAS.find((g) => g.slug === slug)).map((g, i) => (
            <Link key={g.slug} href={`/guias/${g.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${i * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n="documento" /></span>
              <h3>{g.corto}</h3>
              <p>{g.resumen}</p>
              <span className="web-enlace">{tr('Leer la guía')}<Flecha /></span>
            </Link>
          ))}
        </div>
        <p className="web-centro"><Link href="/guias" className="web-enlace">{tr('Todas las guías')}<Flecha /></Link></p>
      </section>

      <Faq preguntas={FAQ_GENERAL} />
      <Cta />
    </Marco>
  );
}
