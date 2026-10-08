import Link from 'next/link';

// Buscador de las listas: un formulario normal (?q=), así funciona también sin JavaScript y el filtro queda en la dirección.
export default function Buscar({ action, q, ocultos = {}, placeholder }) {
  const limpiar = new URLSearchParams(Object.entries(ocultos).filter(([, v]) => v));
  return (
    <form className="buscar" role="search" action={action}>
      <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
      {Object.entries(ocultos).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <input type="search" name="q" defaultValue={q || ''} placeholder={placeholder} aria-label={placeholder} enterKeyHint="search" autoComplete="off" />
      {q && <Link href={`${action}${limpiar.size ? `?${limpiar}` : ''}`} aria-label="Quitar búsqueda">×</Link>}
    </form>
  );
}
