'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Marca como pagados todos los gastos pendientes de un proveedor.
export default function PagarProveedor({ clave, importe }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const pagar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: 'Registrar pago', texto: `¿Marcar como pagado lo que le debes (${importe})?`, aceptar: 'Marcar como pagado' }))) return;
    try { await llamar('/api/proveedores', { method: 'POST', body: JSON.stringify({ clave }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="boton prov-pagar" onClick={pagar}>Marcar todo como pagado</button>{error && <span className="error" role="alert">{error}</span>}</>;
}
