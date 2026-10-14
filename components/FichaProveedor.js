'use client';

import { FormularioFicha } from './FichaCliente';

export default function FichaProveedor({ ficha, clave, nombre = '', nif = '', ...props }) {
  return <FormularioFicha key={ficha?.id || clave || 'nuevo'} proveedor datos={ficha || { nombre, nif }} id={clave || ficha?.id} {...props} />;
}
