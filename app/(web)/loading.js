// El marcador conserva espacio mientras llega la página: el pie no salta hasta la cabecera.
export default function CargandoWeb() {
  return <div className="web-espera" role="status" aria-label="Cargando página" aria-busy="true">
    <div className="web-cargando"><i /></div>
    <div className="web-espera-hero" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}
