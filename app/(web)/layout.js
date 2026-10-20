import Marco from '@/components/web/Marco';

// Páginas públicas de fisquo.com (funciones, precios, soluciones…). La cabecera y el pie se mantienen al navegar.
export default function LayoutWeb({ children }) {
  return <Marco>{children}</Marco>;
}
