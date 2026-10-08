import Logo, { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';

// Maquetas de pantallas de Netto para la web pública. Todo son datos de ejemplo.

const Fila = ({ a, b, c, d, chip, tipo = 'ok' }) => (
  <div className="mk-fila">
    <div><b>{a}</b>{b && <small>{b}</small>}</div>
    <div className="mk-der">{c && <em className={c.startsWith('+') ? 'mas' : c.startsWith('−') ? 'menos' : undefined}>{c}</em>}{chip && <span className={`mk-chip ${tipo}`}>{chip}</span>}{d && <small>{d}</small>}</div>
  </div>
);

// Ventana grande del hero: el panel de Netto con barra lateral.
export function VentanaApp() {
  const barras = [38, 52, 44, 61, 58, 72, 66, 84, 79, 92, 88, 100];
  return (
    <div className="mk-app" aria-hidden>
      <div className="mk-app-barra"><i /><i /><i /><span>nettohq.com</span></div>
      <div className="mk-app-cuerpo">
        <aside className="mk-lateral">
          <Logo className="mk-lateral-logo" />
          {[['tesoreria', 'Resumen', true], ['factura', 'Facturas'], ['gasto', 'Gastos'], ['impuestos', 'Impuestos'], ['banco', 'Banco'], ['equipo', 'Equipo']].map(([i, t, on]) => (
            <span key={t} className={on ? 'on' : undefined}><Icono n={i} />{t}</span>
          ))}
        </aside>
        <div className="mk-app-main">
          <div className="mk-app-cab"><div><small>Resumen · 2026</small><b>Hola, Marta</b></div><span className="mk-avatar">M</span></div>
          <div className="mk-kpis">
            <div><small>Facturado</small><b>48.920 €</b><span className="mk-sube">+18 %</span></div>
            <div><small>Gastado</small><b>17.304 €</b><span className="mk-sube neutro">−4 %</span></div>
            <div><small>Beneficio</small><b>31.616 €</b><span className="mk-sube">+27 %</span></div>
          </div>
          <div className="mk-grafica">
            <div className="mk-grafica-cab"><b>Beneficio por mes</b><small>Ene — Dic</small></div>
            <div className="mk-barras">{barras.map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i }} />)}</div>
          </div>
          <div className="mk-tabla">
            <Fila a="F-0142 · Sala Apolo" b="Vence en 12 días" c="+1.210,00 €" chip="Pendiente" tipo="pend" />
            <Fila a="F-0141 · Eventos Lume" b="Cobrada ayer" c="+640,00 €" chip="Cobrada" />
            <Fila a="F-0140 · Hotel Arts" b="Cobrada el lunes" c="+2.420,00 €" chip="Cobrada" />
          </div>
        </div>
      </div>
    </div>
  );
}

const PANTALLAS = {
  factura: () => (
    <div className="mk mk-factura">
      <div className="mk-factura-cab"><N className="mk-n" /><div><b>Factura F-0142</b><small>12 de octubre de 2026</small></div><i className="mk-qr" /></div>
      <div className="mk-factura-partes"><div><small>Para</small><b>Sala Apolo SL</b><small>B12345678</small></div><div><small>Vence</small><b>11 nov 2026</b></div></div>
      <Fila a="Sesión DJ · viernes" b="1 × 900,00 €" c="900,00 €" />
      <Fila a="Equipo de sonido" b="1 × 100,00 €" c="100,00 €" />
      <div className="mk-totales"><span>Base <b>1.000,00 €</b></span><span>IVA 21 % <b>210,00 €</b></span><span>IRPF −15 % <b>−150,00 €</b></span><span className="mk-total">Total <b>1.060,00 €</b></span></div>
    </div>
  ),
  gasto: () => (
    <div className="mk mk-gasto">
      <div className="mk-ticket-foto"><span /><span /><span /><span /><i /></div>
      <div className="mk-campos">
        <label>Proveedor<b>Backline Pro SL</b></label>
        <label>Fecha<b>10/10/2026</b></label>
        <label>Base<b>314,05 €</b></label>
        <label>IVA 21 %<b>65,95 €</b></label>
        <span className="mk-chip ok"><Icono n="asistente" />Leído con IA</span>
      </div>
    </div>
  ),
  impuestos: () => (
    <div className="mk">
      <div className="mk-cab"><b>3.er trimestre</b><span className="mk-chip pend">Presentar antes del 20/10</span></div>
      <div className="mk-modelos">
        <div><small>Modelo 303 · IVA</small><b>1.842,30 €</b><span className="mk-barra"><i style={{ '--w': '72%' }} /></span></div>
        <div><small>Modelo 130 · IRPF</small><b>1.120,00 €</b><span className="mk-barra"><i style={{ '--w': '46%' }} /></span></div>
        <div><small>Modelo 111 · Retenciones</small><b>385,00 €</b><span className="mk-barra"><i style={{ '--w': '18%' }} /></span></div>
      </div>
      <div className="mk-aparta"><small>Aparta este trimestre</small><b>3.347,30 €</b></div>
    </div>
  ),
  conciliacion: () => (
    <div className="mk">
      <div className="mk-cab"><b>Extracto · BBVA</b><span className="mk-chip ok">12 de 14 emparejados</span></div>
      <Fila a="Transferencia Sala Apolo" b="→ Factura F-0142" c="+1.210,00 €" chip="✓" />
      <Fila a="Pago Backline Pro SL" b="→ Gasto 10/10" c="−380,00 €" chip="✓" />
      <Fila a="Bizum Eventos Lume" b="→ Factura F-0145" c="+640,00 €" chip="✓" />
      <Fila a="Comisión mantenimiento" b="Sin emparejar" c="−6,00 €" chip="Revisar" tipo="pend" />
    </div>
  ),
  prevision: () => {
    const v = [62, 58, 70, 66, 78, 86];
    return (
      <div className="mk">
        <div className="mk-cab"><b>Previsión de caja</b><span className="mk-seg"><i>3m</i><i className="on">6m</i><i>12m</i></span></div>
        <div className="mk-prev">{v.map((h, i) => <span key={i} style={{ '--h': `${h}%`, '--i': i }}><i /><small>{['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr'][i]}</small></span>)}</div>
        <div className="mk-leyenda"><span><i className="c1" />Saldo previsto</span><b>31.480 € en abril</b></div>
      </div>
    );
  },
  equipo: () => (
    <div className="mk">
      <div className="mk-cab"><b>Usuarios</b><span className="mk-chip ok">+ Invitar</span></div>
      {[['M', 'Marta Ruiz', 'Administradora', 'ok'], ['J', 'Jordi Sala', 'Facturar y gastos', 'neutro'], ['G', 'Gestoría Pons', 'Solo vista', 'pend']].map(([i, n, r, t]) => (
        <div key={n} className="mk-fila mk-usuario"><span className="mk-avatar">{i}</span><div><b>{n}</b><small>{r}</small></div><span className={`mk-chip ${t}`}>{t === 'ok' ? 'Admin' : t === 'pend' ? 'Gestoría' : 'Miembro'}</span></div>
      ))}
      <div className="mk-jornada"><Icono n="reloj" /><div><b>Jornada de hoy</b><small>Entrada 9:02 · 6 h 41 min</small></div><span className="mk-pulso" /></div>
    </div>
  ),
  presupuesto: () => (
    <div className="mk">
      <div className="mk-cab"><b>Presupuesto P-0031</b><span className="mk-chip ok">Aceptado</span></div>
      <Fila a="Boda · DJ y sonido" b="Ceremonia y fiesta" c="1.800,00 €" />
      <Fila a="Iluminación" b="Pack ambiente" c="350,00 €" />
      <div className="mk-aviso"><Icono n="tic" />Eventos Lume lo aceptó desde el móvil · hace 5 min</div>
      <span className="mk-btn">Convertir en factura</span>
    </div>
  ),
  portal: () => (
    <div className="mk">
      <div className="mk-cab"><b>Tus documentos · Sala Apolo</b><Icono n="documento" /></div>
      <Fila a="Factura F-0142" b="12/10/2026" c="1.060,00 €" chip="PDF" tipo="neutro" />
      <Fila a="Factura F-0128" b="08/09/2026" c="980,00 €" chip="PDF" tipo="neutro" />
      <Fila a="Presupuesto P-0029" b="01/09/2026" c="2.150,00 €" chip="Aceptado" />
    </div>
  ),
  recurrentes: () => (
    <div className="mk">
      <div className="mk-cab"><b>Recurrentes</b><span className="mk-chip ok">Activas</span></div>
      <Fila a="Residencia mensual · Club Nit" b="Cada mes, día 1" c="1.200,00 €" d="Próxima: 1 nov" />
      <Fila a="Mantenimiento web" b="Cada trimestre" c="300,00 €" d="Próxima: 1 ene" />
      <Fila a="Alquiler local" b="Gasto · cada mes" c="−650,00 €" d="Próximo: 5 nov" />
    </div>
  ),
  dietas: () => (
    <div className="mk">
      <div className="mk-cab"><b>Desplazamiento · Valencia</b><span className="mk-chip neutro">Con pernocta</span></div>
      <Fila a="Kilometraje" b="350 km × 0,26 €" c="91,00 €" />
      <Fila a="Manutención" b="Límite exento 53,34 €/día" c="53,34 €" />
      <div className="mk-aparta"><small>Total deducible</small><b>144,34 €</b></div>
    </div>
  ),
  proveedores: () => (
    <div className="mk">
      <div className="mk-cab"><b>Backline Pro SL</b><span className="mk-chip pend">380 € pendientes</span></div>
      <Fila a="Alquiler equipo · oct" b="Vence 30/10" c="−380,00 €" chip="Pendiente" tipo="pend" />
      <Fila a="Alquiler equipo · sep" b="Pagado 28/09" c="−380,00 €" chip="Pagado" />
      <Fila a="Cables y adaptadores" b="Pagado 12/09" c="−64,90 €" chip="Pagado" />
    </div>
  ),
  paquete: () => (
    <div className="mk">
      <div className="mk-cab"><b>Paquete 3T · 2026</b><Icono n="importar" /></div>
      {[['Facturas emitidas', '38 documentos'], ['Gastos', '61 documentos'], ['Modelos 303 y 130', 'Casillas calculadas']].map(([a, b]) => <Fila key={a} a={a} b={b} chip="✓" />)}
      <div className="mk-dos"><span className="mk-btn">Excel</span><span className="mk-btn claro">PDF</span></div>
    </div>
  ),
  fraccionado: () => (
    <div className="mk">
      <div className="mk-cab"><b>Pagos fraccionados · 130</b><small>2026</small></div>
      <Fila a="1.er trimestre" b="Presentado 18/04" c="820,00 €" chip="✓" />
      <Fila a="2.º trimestre" b="Presentado 17/07" c="1.040,00 €" chip="✓" />
      <Fila a="3.er trimestre" b="Ya descontado lo anterior" c="1.120,00 €" chip="Calculado" tipo="pend" />
    </div>
  ),
  emparejado: () => (
    <div className="mk mk-par">
      <div className="mk-par-l"><small>Movimiento</small><b>+1.210,00 €</b><small>Transferencia Sala Apolo · 14/10</small></div>
      <div className="mk-par-lazo"><i /><span>✓</span><i /></div>
      <div className="mk-par-l"><small>Factura</small><b>F-0142</b><small>Cobrada el 14/10</small></div>
    </div>
  ),
  resumen: () => {
    const b = [40, 55, 48, 66, 60, 74, 70, 86, 81, 92];
    return (
      <div className="mk">
        <div className="mk-cab"><b>2026 frente a 2025</b><span className="mk-chip ok">+27 %</span></div>
        <div className="mk-barras peq">{b.map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i }} />)}</div>
        <Fila a="Mejor cliente" b="Sala Apolo" c="12.480 €" />
      </div>
    );
  },
  invitaciones: () => (
    <div className="mk">
      <div className="mk-cab"><b>Invitar a tu equipo</b></div>
      <div className="mk-input">gestoria@pons.es<span className="mk-chip pend">Solo vista</span></div>
      <Fila a="jordi@tuempresa.es" b="Caduca en 6 días" chip="Enviada" tipo="neutro" />
      <Fila a="ana@tuempresa.es" b="Se unió ayer" chip="Activa" />
    </div>
  ),
  empresas: () => (
    <div className="mk">
      <div className="mk-cab"><b>Tus empresas</b><Icono n="edificio" /></div>
      {[['L', 'Lume Eventos SL', 'Actual'], ['N', 'Nit Producciones SL', ''], ['M', 'Marta Ruiz · Autónoma', '']].map(([i, n, a]) => (
        <div key={n} className={`mk-fila mk-usuario${a ? ' on' : ''}`}><span className="mk-avatar">{i}</span><div><b>{n}</b></div>{a && <span className="mk-chip ok">{a}</span>}</div>
      ))}
    </div>
  ),
};

export default function Pantalla({ tipo }) {
  const P = PANTALLAS[tipo];
  return P ? <P /> : null;
}
