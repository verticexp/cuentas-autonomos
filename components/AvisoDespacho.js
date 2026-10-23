import '@/app/despacho.css';

// Arriba de cada pantalla mientras la gestoría está dentro de las cuentas de un cliente (lib/auth.js viaDespacho): de quién
// son, desde qué despacho, y cómo volver. Sin JavaScript también funciona (formulario y enlace).
export default function AvisoDespacho({ cliente, despacho, empresa }) {
  return (
    <div className="aviso-despacho" role="status">
      <span>Estás en las cuentas de <b>{cliente}</b> como {despacho}</span>
      <span className="aviso-despacho-acc">
        <a href={`/despacho/${encodeURIComponent(empresa)}`}>Ficha del cliente</a>
        <form method="post" action="/api/despacho/salir"><button type="submit">Volver al despacho</button></form>
      </span>
    </div>
  );
}
