import Ir from './Ir';

// Para quien entra en una pantalla que no le toca: se le dice, en lugar de un «no existe».
export default function SinAcceso({ texto = 'Esta pantalla es solo para el administrador de la empresa. Si la necesitas, pídele acceso.' }) {
  return (
    <main className="pagina">
      <div className="vacio">
        <p>No tienes acceso</p>
        <p>{texto}</p>
        <Ir href="/" className="boton">Ir al inicio</Ir>
      </div>
    </main>
  );
}
