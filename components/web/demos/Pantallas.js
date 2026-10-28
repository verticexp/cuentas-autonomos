'use client';

import Logo, { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { useT } from '@/components/Idioma';

// Maquetas de pantallas de Fisquo para la web pública. Todo son datos de ejemplo.

const Fila = ({ a, b, c, d, chip, tipo = 'ok' }) => {
  const tr = useT();
  return (
    <div className="mk-fila">
      <div><b>{tr(a)}</b>{b && <small>{tr(b)}</small>}</div>
      <div className="mk-der">{c && <em className={c.startsWith('+') ? 'mas' : c.startsWith('−') ? 'menos' : undefined}>{c}</em>}{chip && <span className={`mk-chip ${tipo}`}>{tr(chip)}</span>}{d && <small>{tr(d)}</small>}</div>
    </div>
  );
};

// Ventana grande del hero: el panel de Fisquo con barra lateral.
export function VentanaApp() {
  const tr = useT();
  const barras = [38, 52, 44, 61, 58, 72, 66, 84, 79, 92, 88, 100];
  return (
    <div className="mk-app" aria-hidden>
      <div className="mk-app-barra"><i /><i /><i /><span>fisquo.com</span></div>
      <div className="mk-app-cuerpo">
        <aside className="mk-lateral">
          <Logo className="mk-lateral-logo" />
          {[['tesoreria', 'Resumen', true], ['factura', 'Facturas'], ['gasto', 'Gastos'], ['impuestos', 'Impuestos'], ['banco', 'Banco'], ['equipo', 'Equipo']].map(([i, t, on]) => (
            <span key={t} className={on ? 'on' : undefined}><Icono n={i} />{tr(t)}</span>
          ))}
        </aside>
        <div className="mk-app-main">
          <div className="mk-app-cab"><div><small>{tr('Resumen · 2026')}</small><b>{tr('Hola, Marta')}</b></div><span className="mk-avatar">M</span></div>
          <div className="mk-kpis">
            <div><small>{tr('Facturado')}</small><b>48.920 €</b><span className="mk-sube">+18 %</span></div>
            <div><small>{tr('Gastado')}</small><b>17.304 €</b><span className="mk-sube neutro">−4 %</span></div>
            <div><small>{tr('Beneficio')}</small><b>31.616 €</b><span className="mk-sube">+27 %</span></div>
          </div>
          <div className="mk-grafica">
            <div className="mk-grafica-cab"><b>{tr('Beneficio por mes')}</b><small>{tr('Ene — Dic')}</small></div>
            <div className="mk-barras">{barras.map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i }} />)}</div>
          </div>
          <div className="mk-tabla">
            <Fila a="F-0142 · Altamira Consultores" b="Vence en 12 días" c="+1.210,00 €" chip="Pendiente" tipo="pend" />
            <Fila a="F-0141 · Estudio Norte" b="Cobrada ayer" c="+640,00 €" chip="Cobrada" />
            <Fila a="F-0140 · Clínica Delta" b="Cobrada el lunes" c="+2.420,00 €" chip="Cobrada" />
          </div>
        </div>
      </div>
    </div>
  );
}

const PANTALLAS = {
  factura: () => {
    const tr = useT();
    return (
    <div className="mk mk-factura">
      <div className="mk-factura-cab"><N className="mk-n" /><div><b>{tr('Factura F-0142')}</b><small>{tr('12 de octubre de 2026')}</small></div><i className="mk-qr" /></div>
      <div className="mk-factura-partes"><div><small>{tr('Para')}</small><b>Altamira Consultores SL</b><small>B12345678</small></div><div><small>{tr('Vence')}</small><b>{tr('11 nov 2026')}</b></div></div>
      <Fila a="Consultoría · octubre" b="1 × 900,00 €" c="900,00 €" />
      <Fila a="Material y desplazamiento" b="1 × 100,00 €" c="100,00 €" />
      <div className="mk-totales"><span>{tr('Base')} <b>1.000,00 €</b></span><span>{tr('IVA 21 %')} <b>210,00 €</b></span><span>{tr('IRPF −15 %')} <b>−150,00 €</b></span><span className="mk-total">{tr('Total')} <b>1.060,00 €</b></span></div>
    </div>
    );
  },
  gasto: () => {
    const tr = useT();
    return (
    <div className="mk mk-gasto">
      <div className="mk-ticket-foto"><span /><span /><span /><span /><i /></div>
      <div className="mk-campos">
        <label>{tr('Proveedor')}<b>Suministros Vega SL</b></label>
        <label>{tr('Fecha')}<b>10/10/2026</b></label>
        <label>{tr('Base')}<b>314,05 €</b></label>
        <label>{tr('IVA 21 %')}<b>65,95 €</b></label>
        <span className="mk-chip ok"><Icono n="asistente" />{tr('Leído con IA')}</span>
      </div>
    </div>
    );
  },
  impuestos: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('3.er trimestre')}</b><span className="mk-chip pend">{tr('Presentar antes del 20/10')}</span></div>
      <div className="mk-modelos">
        <div><small>{tr('Modelo 303 · IVA')}</small><b>1.842,30 €</b><span className="mk-barra"><i style={{ '--w': '72%' }} /></span></div>
        <div><small>{tr('Modelo 130 · IRPF')}</small><b>1.120,00 €</b><span className="mk-barra"><i style={{ '--w': '46%' }} /></span></div>
        <div><small>{tr('Modelo 111 · Retenciones')}</small><b>385,00 €</b><span className="mk-barra"><i style={{ '--w': '18%' }} /></span></div>
      </div>
      <div className="mk-aparta"><small>{tr('Aparta este trimestre')}</small><b>3.347,30 €</b></div>
    </div>
    );
  },
  conciliacion: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Extracto · BBVA')}</b><span className="mk-chip ok">{tr('12 de 14 emparejados')}</span></div>
      <Fila a="Transferencia Altamira" b="→ Factura F-0142" c="+1.210,00 €" chip="✓" />
      <Fila a="Pago Suministros Vega SL" b="→ Gasto 10/10" c="−380,00 €" chip="✓" />
      <Fila a="Bizum Estudio Norte" b="→ Factura F-0145" c="+640,00 €" chip="✓" />
      <Fila a="Compra tarjeta Amazon" b="En revisión: falta la factura" c="−86,90 €" chip="Revisar" tipo="pend" />
    </div>
    );
  },
  prevision: () => {
    const tr = useT();
    const v = [62, 58, 70, 66, 78, 86];
    return (
      <div className="mk">
        <div className="mk-cab"><b>{tr('Previsión de caja')}</b><span className="mk-seg"><i>{tr('3m')}</i><i className="on">{tr('6m')}</i><i>{tr('12m')}</i></span></div>
        <div className="mk-prev">{v.map((h, i) => <span key={i} style={{ '--h': `${h}%`, '--i': i }}><i /><small>{tr(['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr'][i])}</small></span>)}</div>
        <div className="mk-leyenda"><span><i className="c1" />{tr('Saldo previsto')}</span><b>{tr('31.480 € en abril')}</b></div>
      </div>
    );
  },
  equipo: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Usuarios')}</b><span className="mk-chip ok">{tr('+ Invitar')}</span></div>
      {[['M', 'Marta Ruiz', 'Administradora', 'ok'], ['J', 'Jordi Sala', 'Facturar y gastos', 'neutro'], ['G', 'Gestoría Pons', 'Solo vista', 'pend']].map(([i, n, r, t]) => (
        <div key={n} className="mk-fila mk-usuario"><span className="mk-avatar">{i}</span><div><b>{n}</b><small>{tr(r)}</small></div><span className={`mk-chip ${t}`}>{tr(t === 'ok' ? 'Admin' : t === 'pend' ? 'Gestoría' : 'Miembro')}</span></div>
      ))}
      <div className="mk-jornada"><Icono n="reloj" /><div><b>{tr('Jornada de hoy')}</b><small>{tr('Entrada 9:02 · 6 h 41 min')}</small></div><span className="mk-pulso" /></div>
    </div>
    );
  },
  presupuesto: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Presupuesto P-0031')}</b><span className="mk-chip ok">{tr('Aceptado')}</span></div>
      <Fila a="Reforma del local" b="Obra y materiales" c="1.800,00 €" />
      <Fila a="Instalación eléctrica" b="Puntos de luz y cuadro" c="350,00 €" />
      <div className="mk-aviso"><Icono n="tic" />{tr('Estudio Norte lo aceptó desde el móvil · hace 5 min')}</div>
      <span className="mk-btn">{tr('Convertir en factura')}</span>
    </div>
    );
  },
  portal: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Tus documentos · Altamira')}</b><Icono n="documento" /></div>
      <Fila a="Factura F-0142" b="12/10/2026" c="1.060,00 €" chip="PDF" tipo="neutro" />
      <Fila a="Factura F-0128" b="08/09/2026" c="980,00 €" chip="PDF" tipo="neutro" />
      <Fila a="Presupuesto P-0029" b="01/09/2026" c="2.150,00 €" chip="Aceptado" />
    </div>
    );
  },
  recurrentes: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Recurrentes')}</b><span className="mk-chip ok">{tr('Activas')}</span></div>
      <Fila a="Servicio mensual · Altamira" b="Cada mes, día 1" c="1.200,00 €" d="Próxima: 1 nov" />
      <Fila a="Mantenimiento web" b="Cada trimestre" c="300,00 €" d="Próxima: 1 ene" />
      <Fila a="Alquiler local" b="Gasto · cada mes" c="−650,00 €" d="Próximo: 5 nov" />
    </div>
    );
  },
  dietas: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Desplazamiento · Valencia')}</b><span className="mk-chip neutro">{tr('Con pernocta')}</span></div>
      <Fila a="Kilometraje" b="350 km × 0,26 €" c="91,00 €" />
      <Fila a="Manutención" b="Límite exento 53,34 €/día" c="53,34 €" />
      <div className="mk-aparta"><small>{tr('Total deducible')}</small><b>144,34 €</b></div>
    </div>
    );
  },
  proveedores: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>Suministros Vega SL</b><span className="mk-chip pend">{tr('380 € pendientes')}</span></div>
      <Fila a="Pedido de material · oct" b="Vence 30/10" c="−380,00 €" chip="Pendiente" tipo="pend" />
      <Fila a="Pedido de material · sep" b="Pagado 28/09" c="−380,00 €" chip="Pagado" />
      <Fila a="Consumibles de oficina" b="Pagado 12/09" c="−64,90 €" chip="Pagado" />
    </div>
    );
  },
  paquete: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Paquete 3T · 2026')}</b><Icono n="importar" /></div>
      {[['Facturas emitidas', '38 documentos'], ['Gastos', '61 documentos'], ['Modelos 303 y 130', 'Casillas calculadas']].map(([a, b]) => <Fila key={a} a={a} b={b} chip="✓" />)}
      <div className="mk-dos"><span className="mk-btn">Excel</span><span className="mk-btn claro">PDF</span></div>
    </div>
    );
  },
  fraccionado: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Pagos fraccionados · 130')}</b><small>2026</small></div>
      <Fila a="1.er trimestre" b="Presentado 18/04" c="820,00 €" chip="✓" />
      <Fila a="2.º trimestre" b="Presentado 17/07" c="1.040,00 €" chip="✓" />
      <Fila a="3.er trimestre" b="Ya descontado lo anterior" c="1.120,00 €" chip="Calculado" tipo="pend" />
    </div>
    );
  },
  emparejado: () => {
    const tr = useT();
    return (
    <div className="mk mk-par">
      <div className="mk-par-l"><small>{tr('Movimiento')}</small><b>+1.210,00 €</b><small>Transferencia Altamira · 14/10</small></div>
      <div className="mk-par-lazo"><i /><span>✓</span><i /></div>
      <div className="mk-par-l"><small>{tr('Factura')}</small><b>F-0142</b><small>{tr('Cobrada el 14/10')}</small></div>
    </div>
    );
  },
  resumen: () => {
    const tr = useT();
    const b = [40, 55, 48, 66, 60, 74, 70, 86, 81, 92];
    return (
      <div className="mk">
        <div className="mk-cab"><b>{tr('2026 frente a 2025')}</b><span className="mk-chip ok">+27 %</span></div>
        <div className="mk-barras peq">{b.map((h, i) => <i key={i} style={{ '--h': `${h}%`, '--i': i }} />)}</div>
        <Fila a="Mejor cliente" b="Altamira Consultores" c="12.480 €" />
      </div>
    );
  },
  invitaciones: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Invitar a tu equipo')}</b></div>
      <div className="mk-input">gestoria@pons.es<span className="mk-chip pend">{tr('Solo vista')}</span></div>
      <Fila a="jordi@tuempresa.es" b="Caduca en 6 días" chip="Enviada" tipo="neutro" />
      <Fila a="ana@tuempresa.es" b="Se unió ayer" chip="Activa" />
    </div>
    );
  },
  contabilidad: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Pérdidas y ganancias · 2025')}</b><span className="mk-chip ok">{tr('Del diario')}</span></div>
      <Fila a="Cifra de negocios" b="Facturas del año" c="+148.300 €" />
      <Fila a="Gastos de explotación" b="Personal, compras y servicios" c="−93.870 €" />
      <Fila a="Amortización" b="9 bienes de inversión" c="−8.800 €" />
      <Fila a="Resultado del ejercicio" b="Tras el Impuesto sobre Sociedades" c="+35.150 €" chip="✓" />
    </div>
    );
  },
  inventario: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Inventario')}</b><span className="mk-chip ok">{tr('1.515 € en almacén')}</span></div>
      <Fila a="Cable XLR 10 m" b="XLR-10 · mínimo 20" c="16 ud." chip="Bajo mínimo" tipo="pend" />
      <Fila a="Lámpara LED PAR 64" b="PAR64-LED · mínimo 6" c="18 ud." />
      <Fila a="Cinta gaffer 50 m" b="GAF-50 · mínimo 12" c="23 ud." />
    </div>
    );
  },
  pedido: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Qué pedir · Audio Pro')}</b><small>1.140,84 €</small></div>
      <Fila a="Cable XLR 10 m" b="Quedan 16 · mínimo 20" c="44 ud." />
      <Fila a="Micrófono inalámbrico" b="Queda 1 · mínimo 2" c="5 ud." />
      <div className="mk-dos"><span className="mk-btn">{tr('Copiar el pedido')}</span></div>
    </div>
    );
  },
  margen: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>Cable XLR 10 m</b><span className="mk-chip ok">{tr('Margen 58 %')}</span></div>
      <Fila a="Recuento" b="13/10 · había 18, hay 16" c="−2" />
      <Fila a="Venta · Factura A2026-031" b="10/10 · queda 18" c="−28" />
      <Fila a="Compra · Audio Pro" b="25/03 · 10,36 €/ud." c="+36" />
    </div>
    );
  },
  libros: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Libros registro · 2026')}</b><span className="mk-chip ok">{tr('Formato AEAT')}</span></div>
      <Fila a="Facturas expedidas e ingresos" b="48 anotaciones · IVA 7.812,00 €" chip="✓" />
      <Fila a="Facturas recibidas y gastos" b="112 anotaciones · con amortizaciones" chip="✓" />
      <Fila a="Bienes de inversión" b="4 bienes · amortizado y pendiente" chip="✓" />
      <div className="mk-dos"><span className="mk-btn">{tr('Descargar los 3 libros')}</span></div>
    </div>
    );
  },
  anuales: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Cuentas anuales 2025')}</b><span className="mk-chip ok">{tr('Modelo de pymes')}</span></div>
      {[['Balance de pymes', 'Con 2024 al lado'], ['Pérdidas y ganancias', 'Epígrafes oficiales'], ['Cambios en el patrimonio neto', 'Calculado'], ['Memoria', '14 secciones con tus cifras']].map(([a, b]) => <Fila key={a} a={a} b={b} chip="✓" />)}
      <Fila a="Depositar en el Registro" b="Hasta el 30/07/2026" chip="Plazo" tipo="pend" />
    </div>
    );
  },
  amortizaciones: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Bienes de inversión')}</b><small>2026</small></div>
      {[['Furgoneta Renault Master', '16 % al año', 4560, 67], ['Mesa de luces y focos LED', '20 % al año', 1960, 52], ['Dos portátiles', '25 % al año', 1050, 46]].map(([a, b, c, w]) => (
        <div key={a} className="mk-fila"><div><b>{tr(a)}</b><small>{tr(b)}</small><span className="mk-barra"><i style={{ '--w': `${w}%` }} /></span></div><div className="mk-der"><em>{new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(c)} €</em></div></div>
      ))}
    </div>
    );
  },
  migracion: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Saldos a 31/12/2025')}</b><span className="mk-chip ok">{tr('Cuadra')}</span></div>
      <Fila a="100 · Capital social" b="Desde A3" c="3.000,00 €" />
      <Fila a="430 · 3 clientes" b="Subcuentas sumadas una vez" c="2.420,00 €" />
      <Fila a="572 · Bancos" b="Saldo de apertura" c="12.500,00 €" />
      <Fila a="Asiento de apertura" b="Sigues donde lo dejaste" chip="Creado" />
    </div>
    );
  },
  revision: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Gastos · En revisión')}</b><span className="mk-chip pend">3</span></div>
      <Fila a="Amazon EU" b="02/10 · falta la factura" c="−86,90 €" chip="Añadir" tipo="pend" />
      <Fila a="Leroy Merlin" b="04/10 · falta la factura" c="−142,35 €" chip="Añadir" tipo="pend" />
      <Fila a="Comisión mantenimiento" b="Apuntada como gasto bancario" c="−15,00 €" chip="✓" />
    </div>
    );
  },
  empresas: () => {
    const tr = useT();
    return (
    <div className="mk">
      <div className="mk-cab"><b>{tr('Tus empresas')}</b><Icono n="edificio" /></div>
      {[['R', 'Ruiz & Asociados SL', 'Actual'], ['T', 'Taller Ruiz SL', ''], ['M', 'Marta Ruiz · Autónoma', '']].map(([i, n, a]) => (
        <div key={n} className={`mk-fila mk-usuario${a ? ' on' : ''}`}><span className="mk-avatar">{i}</span><div><b>{n}</b></div>{a && <span className="mk-chip ok">{tr(a)}</span>}</div>
      ))}
    </div>
    );
  },
};

export default function Pantalla({ tipo }) {
  const P = PANTALLAS[tipo];
  return P ? <P /> : null;
}
