// Iconos de línea de la web pública (24×24, trazo en currentColor).
const P = {
  factura: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
  gasto: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  impuestos: 'M5 19L19 5M7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  banco: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  tesoreria: 'M4 4v15h16M8 15l3-4 3 2 5-6',
  equipo: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6 6 0 013.5 6',
  asistente: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
  flecha: 'M5 12h14M13 6l6 6-6 6',
  tic: 'M5 12.5l4.5 4.5L19 7',
  chevron: 'M6 9l6 6 6-6',
  escudo: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  candado: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11M12 15v2',
  persona: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  edificio: 'M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20',
  tienda: 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9M10 20v-5h4v5',
  importar: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  movil: 'M8 2h8a1 1 0 011 1v18a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1zM11 18h2',
  campana: 'M6 16v-5a6 6 0 0112 0v5l1.5 2h-15zM10 21h4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cerrar: 'M6 6l12 12M18 6L6 18',
  reloj: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  documento: 'M4 5h16v14H4zM4 9h16M8 13h5',
  nube: 'M7 18a4 4 0 01-.5-8A5.5 5.5 0 0117 8.5 4.5 4.5 0 0117 18z',
  correo: 'M3 6h18v12H3zM3 7l9 6 9-6',
  rayo: 'M13 2L4 14h7l-1 8 9-12h-7z',
  llave: 'M14.5 10.5a4 4 0 10-3.9 3.1L9 15.2V18H6.5v2.5H3.5V18l6.4-6.4M16 7.5h.01',
  codigo: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  ojo: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  mas: 'M12 5v14M5 12h14',
  subir: 'M12 16V4M7 9l5-5 5 5M5 20h14',
};

export default function Icono({ n, className = 'ico' }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path d={P[n]} /></svg>;
}
