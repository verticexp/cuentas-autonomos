import Link from 'next/link';

export default function Volver({ href, children = 'Atrás' }) {
  return <Link href={href} className="volver">‹ {children}</Link>;
}
