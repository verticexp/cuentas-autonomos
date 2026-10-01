import Ir from './Ir';

export default function Volver({ href, children = 'Atrás' }) {
  return <Ir href={href} tipo="atras" className="volver">‹ {children}</Ir>;
}
