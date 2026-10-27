import { headers } from 'next/headers';
import Vacio from '@/components/Vacio';

// absolute: sin la plantilla «%s · Fisquo» del layout (salía «No existe · Fisquo · Fisquo»).
export const metadata = { title: { absolute: 'No existe · Fisquo' } };

const SECCIONES = [
  ['/gastos/proveedores', 'Proveedores'], ['/facturas', 'Facturas'], ['/gastos', 'Gastos'],
  ['/clientes', 'Clientes'], ['/presupuestos', 'Presupuestos'], ['/albaranes', 'Pedidos y albaranes'],
  ['/cartera', 'Cartera de cobros'], ['/tesoreria', 'Tesorería'], ['/proyectos', 'Proyectos'],
  ['/analisis', 'Análisis'], ['/jornada', 'Registro de jornada'], ['/inventario', 'Inventario'],
  ['/nominas', 'Equipo y nóminas'], ['/contabilidad', 'Contabilidad'], ['/modelos', 'Impuestos'],
  ['/ajustes', 'Ajustes'], ['/banco', 'Banco'],
];

export default async function NoExiste() {
  const ruta = ((await headers()).get('x-ruta') || '/').split('?')[0];
  const seccion = SECCIONES.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
  return <main className="pagina">
    <Vacio titulo="Esta página no existe" accion={seccion ? { href: seccion[0], texto: `Volver a ${seccion[1]}` } : { href: '/', texto: 'Ir al Resumen' }} secundaria={seccion && { href: '/', texto: 'Ir al Resumen' }}>
      Puede que se haya borrado, que el enlace haya caducado o que la dirección no esté bien escrita.
    </Vacio>
  </main>;
}
