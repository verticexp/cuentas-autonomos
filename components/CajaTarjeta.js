import { textos } from '@/lib/idiomaServidor';
import Link from 'next/link';
import Vacio from './Vacio';
import CuadreTarjeta from './CuadreTarjeta';
import CuadreManual from './CuadreManual';
import { leer } from '@/lib/redis';
import { leerRango } from '@/lib/indices';
import { numeroFactura } from '@/lib/calculos';
import { listaDias, propuestasTarjeta, saldoCaja, tarjetaPorCuadrar, tarjetaSinLiquidar } from '@/lib/caja';
import { eur, fechaTexto } from '@/lib/formato';

const DIAS = 90;
const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const pct = (c, t) => (t ? `${(Math.round((c / t) * 1000) / 10).toLocaleString('es-ES')} %` : '');

// «Tarjeta y efectivo» de Caja: la tarjeta de los cierres frente a los ingresos del banco que la liquidan (lib/caja.js
// propuestasTarjeta) y el efectivo del cajón según los arqueos (saldoCaja). Lee los cierres de los últimos 90 días y, si
// hay tarjeta por cuadrar o cuadrada, los movimientos del banco. conBanco: si puede ver y cuadrar el banco.
export default async function CajaTarjeta({ u, hoy, conBanco }) {
  const tr = await textos();
  const cierres = (await leerRango(u, 'facturas', masDias(hoy, -DIAS), hoy)).filter((f) => f.caja && !f.rectifica);
  const conTarjeta = cierres.filter((f) => f.caja.tarjeta > 0);
  const movs = conBanco && conTarjeta.length ? (await leer(u, 'banco')) || [] : [];
  const propuestas = propuestasTarjeta(movs, cierres);
  const enPropuesta = new Set(propuestas.flatMap((p) => p.cierres));
  const sinIngreso = tarjetaSinLiquidar(cierres, hoy).filter((f) => !enPropuesta.has(f.id));
  const porId = new Map(cierres.map((f) => [f.id, f]));
  const cuadrados = movs.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'tpv' && m.fecha >= masDias(hoy, -DIAS))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  // Para el cuadre a mano: los ingresos pendientes de los últimos 90 días y la tarjeta sin cuadrar (sin datos del banco de más).
  const ingresos = movs.filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe > 0 && m.fecha >= masDias(hoy, -DIAS))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => ({ id: m.id, fecha: m.fecha, importe: m.importe, concepto: m.concepto || m.contraparte || '' }));
  const porCuadrar = tarjetaPorCuadrar(cierres).map((f) => ({ id: f.id, fecha: f.fecha, tarjeta: f.caja.tarjeta, numero: numeroFactura(f) }));
  const comisiones = cuadrados.reduce((s, m) => s + (m.enlace.comision || 0), 0);
  const tarjetaCuadrada = cuadrados.reduce((s, m) => s + (m.enlace.tarjeta || 0), 0);
  const saldo = saldoCaja(cierres);
  const delMes = saldo.dias.filter((d) => d.fecha.slice(0, 7) === hoy.slice(0, 7));
  const descuadreMes = delMes.reduce((s, d) => s + d.descuadre, 0);

  return (
    <>
      <section className="bloque" id="tarjeta">
        <h2 className="grupo-t">{tr("Tarjeta y banco")}</h2>
        {!conBanco && <p className="grupo-pie arriba">{tr("Para cuadrar la tarjeta con el banco hace falta ver facturas y gastos: pídeselo al administrador.")}</p>}
        {conBanco && !conTarjeta.length && <Vacio compacto icono="factura" titulo={tr("Sin cobros con tarjeta")}>{tr("Cuando apuntes cierres con tarjeta, aquí verás si el banco los ha ingresado.")}</Vacio>}
        {conBanco && conTarjeta.length > 0 && !movs.length && <p className="grupo-pie arriba">{(tr("Sube el extracto o conecta el banco en") + " ")}<Link href="/banco">{tr("Banco")}</Link>{(" " + tr("para cuadrar la tarjeta con sus ingresos."))}</p>}
        {propuestas.length > 0 && (
          <>
            <h3 className="caja-sub">{tr("Para cuadrar")}</h3>
            <ul className="grupo-lista">
              {propuestas.map((p) => (
                <li key={p.mov} className="fila caja-cuadre">
                  <span className="txt">
                    <strong>{(tr("Ingreso del") + " ")}{fechaTexto(p.fecha)} · {eur(p.importe)}</strong>
                    <small>{(p.concepto || tr("Sin concepto"))}</small>
                    <small>{(tr("Tarjeta del") + " ")}{listaDias(p.dias)}: {eur(p.tarjeta)}{(p.comision ? (" " + tr("· comisión {v1} ({v2})", { v1: eur(p.comision), v2: pct(p.comision, p.tarjeta) })) : (" " + tr("· sin comisión")))}</small>
                  </span>
                  <CuadreTarjeta mov={p.mov} cierres={p.cierres} />
                </li>
              ))}
            </ul>
            <p className="grupo-pie">{tr("Al cuadrar, la comisión del TPV se apunta como gasto (comisiones bancarias, sin IVA) y el ingreso queda emparejado en Banco.")}</p>
          </>
        )}
        {conBanco && sinIngreso.length > 0 && (
          <>
            <h3 className="caja-sub">{tr("Tarjeta sin ingreso del banco")}</h3>
            <ul className="grupo-lista">
              {sinIngreso.slice(0, 10).map((f) => <li key={f.id}><Link href={`/facturas/${f.id}`} className="fila"><span className="txt"><strong>{fechaTexto(f.fecha)}</strong><small>{numeroFactura(f)}</small></span><span className="imp">{eur(f.caja.tarjeta)}</span></Link></li>)}
            </ul>
            <p className="grupo-pie">{tr("Más de tres días sin un ingreso que case (con hasta un 4 % de comisión). Si ya llegó, comprueba que el extracto del banco está al día.")}</p>
          </>
        )}
        {ingresos.length > 0 && porCuadrar.length > 0 && <CuadreManual movs={ingresos} cierres={porCuadrar} />}
        {cuadrados.length > 0 && (
          <>
            <h3 className="caja-sub">{tr("Cuadrado")}</h3>
            <ul className="grupo-lista">
              {cuadrados.map((m) => {
                const dias = (m.enlace.cierres || []).map((id) => porId.get(id)?.fecha).filter(Boolean).sort();
                return (
                  <li key={m.id} className="fila caja-cuadre">
                    <span className="txt">
                      <strong>{(tr("Ingreso del") + " ")}{fechaTexto(m.fecha)} · {eur(m.importe)}</strong>
                      <small>{(dias.length ? tr("Tarjeta del {v1}", { v1: listaDias(dias) }) : tr("{v1} cierres", { v1: (m.enlace.cierres || []).length }))}: {eur(m.enlace.tarjeta)}{(m.enlace.comision ? (" " + tr("· comisión {v1}", { v1: eur(m.enlace.comision) })) : "")}</small>
                    </span>
                    <CuadreTarjeta mov={m.id} deshacer />
                  </li>
                );
              })}
            </ul>
            {comisiones > 0 && <p className="grupo-pie">{(tr("Comisiones del TPV en estos ingresos:") + " ")}{eur(comisiones)} ({pct(comisiones, tarjetaCuadrada)}{(" " + tr("de la tarjeta)."))}</p>}
          </>
        )}
      </section>

      <section className="bloque" id="efectivo">
        <h2 className="grupo-t">{tr("Efectivo en caja")}</h2>
        {!saldo.ultimo ? (
          <Vacio compacto icono="factura" titulo={tr("Aún no hay arqueos")} accion={{ href: '/facturas/caja#nuevo-cierre', texto: tr('Apuntar un cierre') }}>{tr("Marca «Contar el efectivo del cajón» al apuntar el cierre y aquí verás cuánto hay y los descuadres.")}</Vacio>
        ) : (
          <>
            <div className="caja-saldo">
              <div><small>{tr("En el cajón")}</small><strong>{eur(saldo.ultimo.contado)}</strong><small>{(tr("contado el") + " ")}{fechaTexto(saldo.ultimo.fecha)}</small></div>
              <div><small>{tr("Descuadre este mes")}</small><strong className={Math.abs(descuadreMes) >= 0.01 ? (descuadreMes < 0 ? 'falta' : 'ok') : ''}>{(Math.abs(descuadreMes) < 0.01 ? tr("Cuadra") : tr(descuadreMes < 0 ? 'Faltan {v1}' : 'Sobran {v1}', { v1: eur(Math.abs(descuadreMes)) }))}</strong><small>{delMes.length} {(delMes.length === 1 ? tr("arqueo") : tr("arqueos"))}</small></div>
            </div>
            <ul className="grupo-lista">
              {[...saldo.dias].reverse().slice(0, 14).map((d) => (
                <li key={d.id}><Link href={`/facturas/${d.id}`} className="fila"><span className="txt"><strong>{fechaTexto(d.fecha)}</strong><small>{(tr("Fondo") + " ")}{eur(d.fondo)}{(" " + tr("· efectivo") + " ")}{eur(d.efectivo)}{(d.salidas ? (" " + tr("· salidas {v1}", { v1: eur(d.salidas) })) : "")}{(" " + tr("· debería haber") + " ")}{eur(d.esperado)}</small></span><span className={`imp${d.descuadre ? (d.descuadre < 0 ? ' caja-menos' : ' caja-mas') : ''}`}>{(d.descuadre ? `${d.descuadre > 0 ? '+' : '−'}${eur(Math.abs(d.descuadre))}` : eur(d.contado))}</span></Link></li>
              ))}
            </ul>
            <p className="grupo-pie">{(tr("De los últimos") + " ")}{DIAS}{(" " + tr("días: faltaron") + " ")}{eur(Math.abs(saldo.faltante))}{(" " + tr("y sobraron") + " ")}{eur(saldo.sobrante)}{(" " + tr("en total. A la derecha, lo contado o el descuadre del día."))}</p>
          </>
        )}
      </section>
    </>
  );
}
