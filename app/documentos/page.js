import { redirect } from 'next/navigation';
import { bloquearPorEmail, exigirDesbloqueo, usuarioActual } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { inicioDe } from '@/lib/permisos';
import { soloDocumentos } from '@/lib/perfilDocumentos';
import { buzonDe, direccionDe } from '@/lib/buzon';
import { despachoDe } from '@/lib/despachos';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import { ordenar, paraCliente } from '@/lib/documentos';
import { abiertoPara, documentosDe, LECTURA } from '@/lib/documentosServidor';
import DocumentosCliente from '@/components/DocumentosCliente';
import { textos } from '@/lib/idiomaServidor';
import '@/app/documentos.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Tus documentos') }; }

// La única pantalla de un cliente «solo documentos» (lib/documentos.js). Quien pasó después a Fisquo completo la sigue
// viendo (solo lectura) si tiene documentos de antes; los demás, a su primera pantalla.
export default async function Documentos() {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  await exigirDesbloqueo(u);
  if (bloquearPorEmail(u)) redirect('/confirmar-email');
  const solo = soloDocumentos(u);
  if (u.viaDespacho || (!solo && !u.documentosAntes)) redirect(inicioDe(u));
  const e = await redis.hget('empresas', u.empresa);
  const docs = await documentosDe(u);
  const despacho = solo ? u.documentos.despacho : u.despachoCliente?.id;
  const [d, peticiones, abierto] = await Promise.all([despacho ? despachoDe(despacho) : null, despacho ? peticionesDe(u.empresa, { despacho }) : [], solo ? abiertoPara(e) : false]);
  const inicial = {
    documentos: ordenar(docs).map(paraCliente), abierto, aviso: abierto ? '' : solo ? LECTURA : 'Ya llevas tus cuentas en Fisquo: aquí solo se ven los documentos que enviaste antes.',
    gestoria: d?.nombre || '', correo: abierto ? direccionDe(buzonDe(e)) : '',
    peticiones: pendientes(peticiones).filter((p) => p.tipo === 'documento').map((p) => ({ id: p.id, texto: p.texto, creada: p.creada, por: p.por?.nombre || '' })),
  };
  return <DocumentosCliente inicial={inicial} nombre={u.empresaNombre || u.emisor?.nombre || ''} />;
}
