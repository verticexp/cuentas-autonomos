import Link from '@/components/web/EnlacePublico';
import Logo from '@/components/Logo';
import { CONTACTO, FUNCIONES, SEGMENTOS } from '@/components/web/datos';
import { GUIAS } from '@/data/web-guias';
import { RIVALES } from '@/data/web-comparativas';
import { identidadLegal } from '@/lib/webLegal';
import { textos } from '@/lib/idiomaServidor';

// En el móvil cada grupo de enlaces se pliega (Interacciones los cierra al cargar); en el ordenador siempre abiertos.
export default async function Pie() {
  const tr = await textos();
  const legal = identidadLegal();
  return (
    <footer className="web-pie">
      <div className="web-pie-in">
        <div className="web-pie-marca">
          <Logo className="web-logo" />
          <p>{tr('Facturas, gastos e impuestos, en orden. Gestión financiera para autónomos y pymes. Business para varias sociedades o equipos.')}</p>
          <Link href="/registro" className="web-btn web-btn-peq">{tr('Empieza gratis')}</Link>
        </div>
        <details className="web-pie-grupo" open>
          <summary>{tr('Producto')}</summary>
          <nav aria-label={tr('Producto')}>
            {FUNCIONES.map((f) => <Link key={f.slug} href={`/funciones/${f.slug}`}>{tr(f.nombre)}</Link>)}
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>{tr('Soluciones')}</summary>
          <nav aria-label={tr('Soluciones')}>
            {SEGMENTOS.map((s) => <Link key={s.id} href={s.ruta}>{tr(s.n)}</Link>)}
            <Link href="/precios">{tr('Precios')}</Link>
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>{tr('Recursos')}</summary>
          <nav aria-label={tr('Recursos')}>
            <Link href="/demo">{tr('Demo sin registrarte')}</Link>
            <Link href="/guias">{tr('Guías fiscales')}</Link>
            {GUIAS.map((g) => <Link key={g.slug} href={`/guias/${g.slug}`}>{g.corto}</Link>)}
            {RIVALES.map((r) => <Link key={r.slug} href={`/comparativa/${r.slug}`}>{tr('Fisquo frente a {rival}', { rival: r.nombre })}</Link>)}
          </nav>
        </details>
        <details className="web-pie-grupo" open>
          <summary>Fisquo</summary>
          <nav aria-label="Fisquo">
            <Link href="/seguridad">{tr('Seguridad')}</Link>
            <Link href="/verificado">{tr('Cálculos verificados')}</Link>
            <Link href="/contacto">{tr('Contacto')}</Link>
            <Link href="/gestorias">{tr('¿Eres gestoría? Trabaja con nosotros')}</Link>
            <a href="/login">{tr('Entrar')}</a>
            <a href="/privacidad">{tr('Privacidad')}</a>
            <a href="/condiciones">{tr('Condiciones')}</a>
            {legal && <Link href="/aviso-legal">{tr('Aviso legal')}</Link>}
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
