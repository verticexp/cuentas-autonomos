import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import { ordenar, paraPantalla, resumen } from '@/lib/bandeja';
import { adelantarLecturas, documentosBandeja } from '@/lib/bandejaServidor';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import Vacio from '@/components/Vacio';
import Bandeja from '@/components/Bandeja';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Bandeja de facturas recibidas (lib/bandeja.js): lo subido o reenviado que espera a convertirse en gasto.
export default async function BandejaPagina({ searchParams }) {
  const u = await requerir('gastos');
  if (!redis) return <SinBD />;
  const { aviso } = (await searchParams) || {};
  const docs = await documentosBandeja(u);
  await adelantarLecturas(u, docs);
  const r = resumen(docs);
  return (
    <main className="pagina mk-look gastos">
      <Volver href="/gastos">Gastos</Volver>
      <header className="cabecera"><h1 className="titulo">Bandeja de facturas</h1></header>
      {aviso === 'banco' && <p className="nota" role="status">Gasto guardado, pero el cargo del banco ya no casaba: emparéjalo desde Gastos › En revisión.</p>}
      <Bandeja inicial={ordenar(docs).map(paraPantalla)} resumenInicial={r} puedeGastar={puede(u, 'gastar')} />
      {!docs.length && <Vacio icono="gasto" titulo="No tienes facturas pendientes">Las facturas que subas aquí se leen solas y esperan a que las revises. Nada se apunta como gasto hasta que lo apruebas.</Vacio>}
    </main>
  );
}

export const metadata = { title: 'Bandeja de facturas' };
