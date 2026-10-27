import Link from 'next/link';
import { textos } from '@/lib/idiomaServidor';

// Buscador de las listas: un formulario normal (?q=), así funciona también sin JavaScript y el filtro queda en la dirección.
// etiqueta: lo que lee el lector de pantalla si el texto de ejemplo es corto («Buscar facturas»).
export default async function Buscar({ action, q, ocultos = {}, placeholder, etiqueta }) {
  const tr = await textos();
  const limpiar = new URLSearchParams(Object.entries(ocultos).filter(([, v]) => v));
  return (
    <form className="buscar" role="search" action={action}>
      <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
      {Object.entries(ocultos).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <input type="search" name="q" defaultValue={q || ''} placeholder={tr(placeholder)} aria-label={tr(etiqueta || placeholder)} enterKeyHint="search" autoComplete="off" />
      {q && <Link href={`${action}${limpiar.size ? `?${limpiar}` : ''}`} aria-label={tr('Quitar búsqueda')}>×</Link>}
    </form>
  );
}
