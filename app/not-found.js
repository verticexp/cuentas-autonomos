import { headers } from 'next/headers';
import Vacio from '@/components/Vacio';

export const metadata = { title: 'No existe · Fisquo' };

const SECCIONES = [
  ['/gastos/proveedores', 'Proveedores'], ['/facturas', 'Facturas'], ['/gastos', 'Gastos'],
  ['/clientes', 'Clientes'], ['/presupuestos', 'Presupuestos'], ['/albaranes', 'Albaranes'],
  ['/cartera', 'Cartera'], ['/tesoreria', 'Tesorería'], ['/proyectos', 'Proyectos'],
  ['/analisis', 'Análisis'], ['/jornada', 'Jornada'], ['/inventario', 'Inventario'],
  ['/nominas', 'Nóminas'], ['/contabilidad', 'Contabilidad'], ['/modelos', 'Modelos'],
  ['/ajustes', 'Ajustes'], ['/banco', 'Banco'],
];

export default async function NoExiste() {
  const ruta = ((await headers()).get('x-ruta') || '/').split('?')[0];
  const seccion = SECCIONES.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
  return <main className="pagina">
    <Vacio titulo="Esta página no existe" accion={seccion ? { href: seccion[0], texto: `Volver a ${seccion[1]}` } : { href: '/', texto: 'Ir al inicio' }} secundaria={seccion && { href: '/', texto: 'Ir al inicio' }}>
      Puede que se haya borrado, que el enlace haya caducado o que la dirección no esté bien escrita.
    </Vacio>
  </main>;
}
