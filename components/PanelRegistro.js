import Logo, { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { PRUEBA_DIAS } from '@/lib/prueba';
import '@/app/entrar.css';
import '@/app/registro-marca.css';

// Escena de ejemplo: la factura y las notificaciones siguen el lenguaje de la web pública.
// Solo se usa en el alta; el login conserva su panel y su transición con el arranque.
export default function PanelRegistro() {
  return (
    <div className="login-marca registro-marca" aria-hidden="true">
      <div className="registro-marca-interior">
        <Logo className="registro-marca-logo" />
        <div className="registro-marca-texto">
          <h2>Tu primera factura<br />empieza aquí.</h2>
          <p>Facturas, gastos e impuestos.<br />Todo empieza a encajar.</p>
        </div>
        <div className="registro-escena">
          <div className="registro-papel">
            <div className="registro-papel-cab">
              <N className="registro-papel-n" />
              <div><b>Factura F-0142</b><small>Estudio Horizonte</small></div>
              <span className="registro-papel-estado">Cobrada</span>
            </div>
            <div className="registro-papel-cliente"><small>Para</small><b>Altamira Consultores SL</b></div>
            <div className="registro-papel-linea"><span>Diseño y producción</span><b>1.000,00 €</b></div>
            <div className="registro-papel-totales">
              <span>Base imponible<b>1.000,00 €</b></span>
              <span>IVA 21 %<b>210,00 €</b></span>
              <span>Retención IRPF 15 %<b>−150,00 €</b></span>
              <span className="registro-papel-total">Total<b>1.060,00 €</b></span>
            </div>
          </div>
          <div className="registro-globo registro-globo-cobro">
            <span className="registro-globo-icono cobro"><Icono n="tic" /></span>
            <span><b>Factura cobrada</b><small>+1.060,00 € · Altamira</small></span>
          </div>
          <div className="registro-globo registro-globo-ticket">
            <span className="registro-globo-icono"><Icono n="asistente" /></span>
            <span><b>Ticket leído con IA</b><small>Suministros Vega · 380,00 €</small></span>
          </div>
          <div className="registro-globo registro-globo-impuestos">
            <span className="registro-globo-icono impuestos"><Icono n="impuestos" /></span>
            <span><b>Tus impuestos, en orden</b><small>Todo en el mismo sitio</small></span>
          </div>
        </div>
        <p className="registro-marca-pie">{PRUEBA_DIAS} días gratis. Sin tarjeta.<span>Vista de ejemplo de Netto</span></p>
      </div>
    </div>
  );
}
