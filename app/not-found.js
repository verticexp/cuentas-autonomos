import { headers } from 'next/headers';
import Vacio from '@/components/Vacio';
import { textos } from '@/lib/idiomaServidor';

// absolute: sin la plantilla «%s · Fisquo» del layout (salía «No existe · Fisquo · Fisquo»).
export async function generateMetadata() { return { title: { absolute: (await textos())('No existe · Fisquo') } }; }

const SECCIONES = [
  ['/gastos/proveedores', 'Proveedores'], ['/facturas', 'Facturas'], ['/gastos', 'Gastos'],
  ['/clientes', 'Clientes'], ['/presupuestos', 'Presupuestos'], ['/albaranes', 'Pedidos y albaranes'],
  ['/cartera', 'Cartera de cobros'], ['/tesoreria', 'Tesorería'], ['/proyectos', 'Proyectos'],
  ['/analisis', 'Análisis'], ['/jornada', 'Registro de jornada'], ['/inventario', 'Inventario'],
  ['/nominas', 'Equipo y nóminas'], ['/contabilidad', 'Contabilidad'], ['/modelos', 'Impuestos'],
  ['/ajustes', 'Ajustes'], ['/banco', 'Banco'],
];

export default async function NoExiste() {
  const tr = await textos();
  const ruta = ((await headers()).get('x-ruta') || '/').split('?')[0];
  const seccion = SECCIONES.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
  return <main className="pagina">
    <Vacio titulo={tr('Esta página no existe')} accion={seccion ? { href: seccion[0], texto: tr('Volver a {seccion}', { seccion: tr(seccion[1]) }) } : { href: '/', texto: tr('Ir al Resumen') }} secundaria={seccion && { href: '/', texto: tr('Ir al Resumen') }}>
      {tr('Puede que se haya borrado, que el enlace haya caducado o que la dirección no esté bien escrita.')}
    </Vacio>
  </main>;
}
