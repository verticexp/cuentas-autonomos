import '@/app/legal.css';
import { VERSION } from '@/lib/verifactuEnvio';

export const metadata = { title: 'Declaración responsable · Netto' };

// Declaración responsable del sistema informático de facturación (RD 1007/2023, art. 13; Orden HAC/1177/2024, art. 15),
// según el ejemplo 1 de la AEAT (producto de uso solo VERI*FACTU). Los datos del productor salen de las variables
// NETTO_RAZON, NETTO_NIF, NETTO_DIRECCION, NETTO_DECLARACION_FECHA y NETTO_DECLARACION_LUGAR: sin ellas, no se publica.
export default function Declaracion() {
  const d = { razon: process.env.NETTO_RAZON, nif: process.env.NETTO_NIF, direccion: process.env.NETTO_DIRECCION, fecha: process.env.NETTO_DECLARACION_FECHA, lugar: process.env.NETTO_DECLARACION_LUGAR };
  if (Object.values(d).some((v) => !v)) {
    return (
      <main className="legal">
        <a className="legal-volver" href="/">Netto</a>
        <h1>Declaración responsable del sistema informático de facturación</h1>
        <p>La declaración responsable de Netto se está completando. Para cualquier duda: <a href="mailto:corporate@nettohq.com">corporate@nettohq.com</a>.</p>
      </main>
    );
  }
  return (
    <main className="legal">
      <a className="legal-volver" href="/">Netto</a>
      <h1>Declaración responsable del sistema informático de facturación</h1>
      <h2>1.a) Nombre del sistema informático</h2>
      <p>Netto</p>
      <h2>1.b) Código identificador del sistema informático</h2>
      <p>NT</p>
      <h2>1.c) Versión</h2>
      <p>{VERSION}</p>
      <h2>1.d) Componentes y funcionalidades</h2>
      <p>Aplicación web en la nube (con aplicación para móvil que la abre) para facturar y gestionar la facturación: expedir facturas y rectificativas, consultarlas, exportarlas y llevar gastos, impuestos y tesorería. No se instala en los equipos del usuario: funciona en los servidores de la entidad productora y se usa desde el navegador.</p>
      <p>Permite gestionar de forma independiente la facturación de varios obligados tributarios, cumpliendo por separado para cada uno lo dispuesto en la normativa del apartado 1.k), como si se tratara de sistemas informáticos de facturación distintos.</p>
      <h2>1.e) ¿Funciona exclusivamente como «VERI*FACTU»?</h2>
      <p>S - Sí</p>
      <h2>1.f) ¿Permite su uso por varios obligados tributarios?</h2>
      <p>S - Sí</p>
      <h2>1.g) Tipos de firma</h2>
      <p>Dado que solo puede utilizarse en la modalidad «VERI*FACTU», no se realiza una firma electrónica expresa de los registros de facturación, ya que la normativa considera que quedan firmados al remitirse correctamente a los servicios electrónicos de la Agencia Tributaria con la debida autenticación mediante certificado electrónico cualificado.</p>
      <h2>1.h) Razón social de la entidad productora</h2>
      <p>{d.razon}</p>
      <h2>1.i) NIF de la entidad productora</h2>
      <p>{d.nif}</p>
      <h2>1.j) Dirección postal de contacto</h2>
      <p>{d.direccion}</p>
      <h2>1.k) Cumplimiento</h2>
      <p>La entidad productora del sistema informático hace constar que dicho sistema, en la versión indicada, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria; en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre; en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden.</p>
      <h2>1.l) Fecha y lugar de suscripción</h2>
      <p>{d.fecha}, en {d.lugar}.</p>
      <h2>Anexo · Otras formas de contacto</h2>
      <p><a href="mailto:corporate@nettohq.com">corporate@nettohq.com</a></p>
    </main>
  );
}
