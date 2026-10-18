import Ir from './Ir';
import { sinFuncion } from '@/lib/planes';

export default function SinPlan({ usuario, funcion }) {
  return <main className="pagina mk-look"><div className="vacio">
    <h1>Esta función está incluida en Pro</h1>
    <p>{sinFuncion(usuario.plan, funcion)}</p>
    {usuario.rol === 'admin' ? <Ir href="/ajustes/plan" className="boton">Ver mi plan</Ir> : <p>Pide al administrador de tu empresa que revise el plan.</p>}
    <Ir href="/" className="nota">Volver al resumen</Ir>
  </div></main>;
}
