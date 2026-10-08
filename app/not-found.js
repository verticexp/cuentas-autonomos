import Ir from '@/components/Ir';

export const metadata = { title: 'No existe · Netto' };

// Lo que no existe (o ya no): una factura borrada, un enlace caducado o una dirección mal escrita.
export default function NoExiste() {
  return (
    <main className="pagina">
      <div className="vacio">
        <p>Vaya, esto no existe</p>
        <p>Puede que se haya borrado, que el enlace haya caducado o que la dirección no esté bien escrita.</p>
        <Ir href="/" className="boton">Ir al inicio</Ir>
      </div>
    </main>
  );
}
