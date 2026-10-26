'use client';

import { FormularioFicha } from './FichaCliente';

// La ficha guardada puede no tener el nombre o el NIF que sí traen sus gastos: sin ellos, el campo salía vacío aunque
// arriba se viera «NIF …», y se perdía al guardar.
export default function FichaProveedor({ ficha, clave, nombre = '', nif = '', ...props }) {
  const datos = { ...ficha, nombre: ficha?.nombre || nombre, nif: ficha?.nif || nif };
  return <FormularioFicha key={ficha?.id || clave || 'nuevo'} proveedor datos={datos} id={clave || ficha?.id} {...props} />;
}
