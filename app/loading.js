// Se muestra al instante al tocar un enlace, mientras llega la pantalla nueva.
export default function Cargando() {
  return (
    <main className="pagina cargando" aria-busy="true">
      <div className="esqueleto titulo-e" />
      <div className="esqueleto bloque-e" />
      <div className="esqueleto fila-e" />
      <div className="esqueleto fila-e" />
      <div className="esqueleto fila-e" />
    </main>
  );
}
