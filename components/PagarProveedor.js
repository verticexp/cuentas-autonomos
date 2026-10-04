'use client';

import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Marca como pagados todos los gastos pendientes de un proveedor.
export default function PagarProveedor({ clave, importe }) {
  const router = useRouter();
  const pagar = async () => {
    if (!confirm(`¿Marcar como pagado lo que le debes (${importe})?`)) return;
    try { await llamar('/api/proveedores', { method: 'POST', body: JSON.stringify({ clave }) }); router.refresh(); } catch (e) { alert(e.message); }
  };
  return <button className="boton prov-pagar" onClick={pagar}>Marcar todo como pagado</button>;
}
