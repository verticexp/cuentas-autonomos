'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';

// Marca como pagados todos los gastos pendientes de un proveedor.
export default function PagarProveedor({ clave, importe }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const pagar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: tr('Registrar pago'), texto: tr('¿Marcar como pagado lo que le debes ({importe})?', { importe }), aceptar: tr('Marcar como pagado') }))) return;
    try { await llamar('/api/proveedores', { method: 'POST', body: JSON.stringify({ clave }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="boton prov-pagar" onClick={pagar}>{tr('Marcar todo como pagado')}</button>{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}
