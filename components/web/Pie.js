import Link from 'next/link';
import Logo from '@/components/Logo';
import { CONTACTO, FUNCIONES, SEGMENTOS } from '@/components/web/datos';

export default function Pie() {
  return (
    <footer className="web-pie">
      <div className="web-pie-in">
        <div className="web-pie-marca">
          <Logo className="web-logo" />
          <p>Facturas, gastos e impuestos, en orden. Gestión financiera para autónomos, pymes y grandes empresas.</p>
          <Link href="/contacto" className="web-btn web-btn-peq">Pedir acceso</Link>
        </div>
        <nav aria-label="Producto">
          <p>Producto</p>
          {FUNCIONES.map((f) => <Link key={f.slug} href={`/funciones/${f.slug}`}>{f.nombre}</Link>)}
        </nav>
        <nav aria-label="Soluciones">
          <p>Soluciones</p>
          {SEGMENTOS.map((s) => <Link key={s.id} href={s.ruta}>{s.n}</Link>)}
          <Link href="/precios">Precios</Link>
        </nav>
        <nav aria-label="Netto">
          <p>Netto</p>
          <Link href="/seguridad">Seguridad</Link>
          <Link href="/contacto">Contacto</Link>
          <a href="/login">Entrar</a>
          <a href="/privacidad">Privacidad</a>
          <a href="/condiciones">Condiciones</a>
        </nav>
      </div>
      <div className="web-pie-base">
        <span>© {new Date().getFullYear()} Netto · nettohq.com</span>
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
      </div>
      <Logo className="web-pie-gigante" />
    </footer>
  );
}
