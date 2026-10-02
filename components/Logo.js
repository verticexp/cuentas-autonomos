// La N de Netto: trazo redondeado con un corte en la diagonal. «corte» es el color del fondo sobre el que va.
export const N = ({ corte = 'var(--fondo-logo, var(--verde))', className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <path d="M30 74V30l40 40V26" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 18l39 39" stroke={corte} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default function Logo({ corte }) {
  return <span className="logo-netto"><N corte={corte} />netto</span>;
}
