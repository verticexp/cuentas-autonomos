import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import { ordenar, paraPantalla, resumen } from '@/lib/bandeja';
import { adelantarLecturas, documentosBandeja } from '@/lib/bandejaServidor';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import Vacio from '@/components/Vacio';
import Bandeja from '@/components/Bandeja';
import BuzonCorreo from '@/components/BuzonCorreo';
import { correoEntranteListo } from '@/lib/correoEntrante';
import { buzonDe, confirmacionVigente, direccionDe } from '@/lib/buzon';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// «Facturas por revisar» (lib/bandeja.js): lo subido o reenviado que espera a convertirse en gasto. En Gastos se ven
// las primeras (components/Bandeja.js compacto); aquí, todas, la dirección de correo y las aprobadas solas.
export default async function BandejaPagina({ searchParams }) {
  const u = await requerir('gastos');
  if (!redis) return <SinBD />;
  const { aviso } = (await searchParams) || {};
  const docs = await documentosBandeja(u);
  await adelantarLecturas(u, docs);
  const r = resumen(docs);
  const b = buzonDe(u);
  return (
    <main className="pagina mk-look gastos">
      <Volver href="/gastos">Gastos</Volver>
      <header className="cabecera"><h1 className="titulo">Facturas por revisar</h1></header>
      {aviso === 'banco' && <p className="nota" role="status">Gasto guardado, pero el cargo del banco ya no casaba: emparéjalo desde Gastos › En revisión.</p>}
      <BuzonCorreo inicial={{ listo: correoEntranteListo(), direccion: direccionDe(b), remitentes: b?.remitentes || [], confirmacion: confirmacionVigente(b) }} admin={Boolean(u.admin)} puedeGastar={puede(u, 'gastar')} />
      <Bandeja inicial={ordenar(docs).map(paraPantalla)} resumenInicial={r} puedeGastar={puede(u, 'gastar')} />
      {!docs.length && <Vacio icono="gasto" titulo="No tienes facturas pendientes">Las facturas que subas aquí se leen solas y esperan a que las revises. Nada se apunta como gasto hasta que lo apruebas.</Vacio>}
    </main>
  );
}

export const metadata = { title: 'Facturas por revisar' };
