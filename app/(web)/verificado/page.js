import Icono from '@/components/web/Icono';
import { Cta, Encabezado } from '@/components/web/Bloques';

export const metadata = { title: 'Cálculos verificados · Kontix', description: 'Cómo se comprueban los cálculos fiscales de Kontix: 1.000 empresas simuladas, recalculadas por otro camino y comparadas céntimo a céntimo antes de cada versión.' };

const CIFRAS = [
  { n: 1000, t: 'empresas simuladas', d: 'Autónomos y sociedades ficticias' },
  { pre: 'más de', n: 470000, t: 'comprobaciones', d: 'En cada versión de Kontix' },
  { n: 0, t: 'diferencias', d: 'Si hay una sola, no se publica' },
  { pre: 'más de', n: 870, t: 'pruebas automáticas', d: 'Además de la batería de empresas' },
];

const SIMULA = [
  'Facturas de varias líneas y con descuentos',
  'IVA del 0, 4, 10 y 21 %',
  'Retenciones del 7 y 15 %',
  'Facturas rectificativas y cobros parciales',
  'Clientes de España, de la UE y de fuera',
  'Gastos con IVA deducible en parte',
  'Compras a la UE con autoliquidación',
  'Bienes de inversión y alquileres',
  'Profesionales con retención',
];

const COMPARA = [
  { i: 'impuestos', t: 'Modelos fiscales', d: 'Los modelos 303, 390, 130, 115, 347 y 349 se recalculan y se comparan con los de Kontix.' },
  { i: 'tesoreria', t: 'Compensación de IVA', d: 'Si te sale IVA a devolver, se comprueba que la compensación entre periodos es la correcta.' },
  { i: 'contabilidad', t: 'Asientos y balance', d: 'Los asientos tienen que cuadrar y el balance también. Si no, la prueba falla.' },
  { i: 'inventario', t: 'Amortizaciones', d: 'Cada bien de inversión se amortiza por otro camino y las cuotas tienen que coincidir.' },
  { i: 'factura', t: 'Numeración correlativa', d: 'Las facturas de cada serie siguen la numeración, sin saltos ni repetidos.' },
  { i: 'reloj', t: 'Plazos', d: 'Los plazos de cada modelo nunca caen en fin de semana.' },
];

export default function Verificado() {
  return (
    <>
      <section className="web-hero-pag centro">
        <span className="web-fcard-ico grande web-entra"><Icono n="tic" /></span>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Tus números se comprueban <em>en cada versión.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Antes de publicar cualquier cambio, Kontix recalcula miles de operaciones por otro camino y las compara con las suyas. Así sabemos que los cálculos no se han roto.</p>
      </section>

      <section className="web-sec web-sec-pegada">
        <div className="web-cifras">
          {CIFRAS.map((c, i) => (
            <div key={c.t} data-r style={{ '--d': `${i * 70}ms` }}>
              <b>{c.pre && <i>{c.pre}</i>}<span data-contar={c.n}>{c.n.toLocaleString('es-ES', { useGrouping: 'always' })}</span></b>
              <p>{c.t}</p><small>{c.d}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">Cómo se comprueba</p>
            <h2>1.000 empresas que no existen, con casos que sí pasan</h2>
            <p>Una batería de pruebas simula 1.000 empresas ficticias, autónomos y sociedades. Cada una se recalcula por otro camino, en céntimos enteros, y se compara con lo que calcula Kontix.</p>
          </div>
          <ol>
            {SIMULA.map((s) => <li key={s}><b>{s}</b></li>)}
          </ol>
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Qué se compara" titulo="Lo que tiene que coincidir, céntimo a céntimo" sub="Más de 470.000 comprobaciones en cada versión, con cero diferencias." />
        <div className="web-extras tres">
          {COMPARA.map((m, k) => (
            <div key={m.t} data-foco data-r style={{ '--d': `${(k % 3) * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n={m.i} /></span>
              <b>{m.t}</b><p>{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Antes de publicar" titulo="Si una sola prueba falla, no sale" sub="Además de la batería de empresas, hay más de 870 pruebas automáticas y una suite de más de 330 pruebas de extremo a extremo, que usa la app como un cliente real. Nada se publica si una sola falla." />
      </section>

      <section className="web-sec">
        <Encabezado kicker="Con honestidad" titulo="Lo que Kontix no hace por ti" sub="Los modelos son borradores y conviene revisarlos con tu gestor antes de presentarlos. Y hay casos que Kontix todavía no cubre: Canarias (IGIC), País Vasco y Navarra, y la ventanilla única (OSS)." />
      </section>

      <Cta titulo="¿Quieres ver cómo calcula Kontix?" sub="Pruébalo gratis y compara los modelos con los tuyos. Si tienes dudas, escríbenos." otro={['/contacto', 'Hablar con nosotros']} />
    </>
  );
}
