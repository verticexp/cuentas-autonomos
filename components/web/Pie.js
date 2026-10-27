import Link from '@/components/web/EnlacePublico';
import Logo from '@/components/Logo';
import { CONTACTO, FUNCIONES, SEGMENTOS } from '@/components/web/datos';
import { GUIAS } from '@/data/web-guias';
import { RIVALES } from '@/data/web-comparativas';
import { identidadLegal } from '@/lib/webLegal';

// En el móvil cada grupo de enlaces se pliega (Interacciones los cierra al cargar); en el ordenador siempre abiertos.
export default function Pie() {
  const legal = identidadLegal();
  return (
    <footer className="web-pie">
      <div className="web-pie-in">
        <div className="web-pie-marca">
          <Logo className="web-logo" />
          <p>Facturas, gastos e impuestos, en orden. Gestión financiera para autónomos y pymes. Business para varias sociedades o equipos.</p>
          <Link href="/registro" className="web-btn web-btn-peq">Empieza gratis</Link>
        </div>
        <details className="web-pie-grupo" open>
          <summary>Producto</summary>
          <nav aria-label="Producto">
            {FUNCIONES.map((f) => <Link key={f.slug} href={`/funciones/${f.slug}`}>{f.nombre}</Link>)}
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>Soluciones</summary>
          <nav aria-label="Soluciones">
            {SEGMENTOS.map((s) => <Link key={s.id} href={s.ruta}>{s.n}</Link>)}
            <Link href="/precios">Precios</Link>
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>Recursos</summary>
          <nav aria-label="Recursos">
            <Link href="/demo">Demo sin registrarte</Link>
            <Link href="/guias">Guías fiscales</Link>
            {GUIAS.map((g) => <Link key={g.slug} href={`/guias/${g.slug}`}>{g.corto}</Link>)}
            {RIVALES.map((r) => <Link key={r.slug} href={`/comparativa/${r.slug}`}>Fisquo frente a {r.nombre}</Link>)}
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>Fisquo</summary>
          <nav aria-label="Fisquo">
            <Link href="/seguridad">Seguridad</Link>
            <Link href="/verificado">Cálculos verificados</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/gestorias">¿Eres gestoría? Trabaja con nosotros</Link>
            <a href="/login">Entrar</a>
            <a href="/privacidad">Privacidad</a>
            <a href="/condiciones">Condiciones</a>
            {legal && <Link href="/aviso-legal">Aviso legal</Link>}
          </nav>
        </details>
      </div>
      <div className="web-pie-base">
        <span>© {new Date().getFullYear()} Fisquo · fisquo.com</span>
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
        {legal && <p className="web-pie-legal">{legal.titular} · NIF {legal.nif} · {legal.domicilio}</p>}
      </div>
      <Logo className="web-pie-gigante" />
    </footer>
  );
}
