import Logo, { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { PRUEBA_DIAS } from '@/lib/prueba';
import { textos } from '@/lib/idiomaServidor';
import '@/app/entrar.css';
import '@/app/registro-marca.css';

// Escena de ejemplo: la factura y las notificaciones siguen el lenguaje de la web pública.
// Solo se usa en el alta; el login conserva su panel y su transición con el arranque.
export default async function PanelRegistro() {
  const tr = await textos();
  return (
    <div className="login-marca registro-marca" aria-hidden="true">
      <div className="registro-marca-interior">
        <Logo className="registro-marca-logo" />
        <div className="registro-marca-texto">
          <h2>{tr('Tu primera factura')}<br />{tr('empieza aquí.')}</h2>
          <p>{tr('Facturas, gastos e impuestos.')}<br />{tr('Todo empieza a encajar.')}</p>
        </div>
        <div className="registro-escena">
          <div className="registro-papel">
            <div className="registro-papel-cab">
              <N className="registro-papel-n" />
              <div><b>{tr('Factura')} F-0142</b><small>Estudio Horizonte</small></div>
              <span className="registro-papel-estado">{tr('Cobrada')}</span>
            </div>
            <div className="registro-papel-cliente"><small>{tr('Para')}</small><b>Altamira Consultores SL</b></div>
            <div className="registro-papel-linea"><span>{tr('Diseño y producción')}</span><b>1.000,00 €</b></div>
            <div className="registro-papel-totales">
              <span>{tr('Base imponible')}<b>1.000,00 €</b></span>
              <span>{tr('IVA 21 %')}<b>210,00 €</b></span>
              <span>{tr('Retención IRPF 15 %')}<b>−150,00 €</b></span>
              <span className="registro-papel-total">{tr('Total')}<b>1.060,00 €</b></span>
            </div>
          </div>
          <div className="registro-globo registro-globo-cobro">
            <span className="registro-globo-icono cobro"><Icono n="tic" /></span>
            <span><b>{tr('Factura cobrada')}</b><small>+1.060,00 € · Altamira</small></span>
          </div>
          <div className="registro-globo registro-globo-ticket">
            <span className="registro-globo-icono"><Icono n="asistente" /></span>
            <span><b>{tr('Ticket leído con IA')}</b><small>Suministros Vega · 380,00 €</small></span>
          </div>
          <div className="registro-globo registro-globo-impuestos">
            <span className="registro-globo-icono impuestos"><Icono n="impuestos" /></span>
            <span><b>{tr('Tus impuestos, en orden')}</b><small>{tr('Todo en el mismo sitio')}</small></span>
          </div>
        </div>
        <p className="registro-marca-pie">{tr('{n} días gratis. Sin tarjeta.', { n: PRUEBA_DIAS })}<span>{tr('Vista de ejemplo de Fisquo')}</span></p>
      </div>
    </div>
  );
}
