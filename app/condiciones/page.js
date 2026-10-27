import '@/app/legal.css';
import VolverLegal from '@/components/VolverLegal';
import { EMPRESA_LEGAL } from '@/data/empresa-legal';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Condiciones de uso' };
const EMAIL = EMPRESA_LEGAL.email || CONTACTO;

export default function Condiciones() {
  return (
    <main className="legal">
      <VolverLegal />
      <h1>Condiciones de uso</h1>
      <p className="legal-fecha">Última actualización: 26 de octubre de 2026</p>

      <h2>Qué es Fisquo</h2>
      <p>Fisquo es una aplicación para que autónomos y pequeñas empresas lleven sus cuentas: facturas, gastos, impuestos, nóminas, registro de jornada, tesorería y conexión con el banco. La presta {EMPRESA_LEGAL.titular}, con NIF {EMPRESA_LEGAL.nif} y domicilio en {EMPRESA_LEGAL.domicilio} (contacto: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>). Al usar Fisquo aceptas estas condiciones.</p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Eres responsable de guardar tu contraseña y de lo que hagan los usuarios a los que invites, con los permisos que les des.</li>
        <li>Los datos que introduces son tuyos. Debes tener derecho a usarlos, incluidos los de tus clientes y empleados.</li>
      </ul>

      <h2>Cálculos, impuestos y asistente</h2>
      <p>Fisquo calcula impuestos, modelos y nóminas a partir de los datos que introduces, y el asistente responde con esas mismas cifras. Son una ayuda: no sustituyen el asesoramiento de un gestor o asesor fiscal. Revisa lo que presentes ante Hacienda o la Seguridad Social; la responsabilidad de esas presentaciones es tuya.</p>

      <h2>Conexión con el banco</h2>
      <p>Si conectas tu banco, lo haces a través de Enable Banking, proveedor autorizado de información de cuentas, con tu autorización en la web o app de tu banco. Fisquo solo lee saldos y movimientos; no puede hacer pagos ni transferencias. Los emparejamientos con facturas y gastos solo se guardan cuando tú los confirmas. Puedes desconectar el banco en cualquier momento.</p>

      <h2>Precio y pago</h2>
      <p>Fisquo tiene una prueba gratuita y, después, es de pago según el plan que elijas, con los precios publicados en la web. La suscripción se renueva sola y puedes cancelarla cuando quieras desde Ajustes; sigue activa hasta el final del periodo pagado. Si la prueba termina o la suscripción se cancela, tu cuenta queda en solo lectura: puedes consultar y descargar tus datos, pero no añadir otros nuevos.</p>

      <h2>Facturación y Verifactu</h2>
      <p>Fisquo es un sistema informático de facturación que funciona en la modalidad «VERI*FACTU»: al emitir una factura, envía su registro a la Agencia Tributaria en tu nombre. Su <a href="/declaracion-responsable">declaración responsable</a> está publicada. Los datos de cada factura los decides tú; revísalos antes de emitirla, porque una factura emitida solo se corrige con una rectificativa.</p>

      <h2>Disponibilidad</h2>
      <p>Hacemos lo posible para que Fisquo funcione siempre y tus datos estén seguros, pero puede haber interrupciones o errores. Te recomendamos descargar periódicamente tus facturas y registros. Fisquo puede cambiar o mejorar funciones; si cambian estas condiciones de forma importante, te avisaremos en la aplicación.</p>

      <h2>Responsabilidad</h2>
      <p>En la medida en que la ley lo permita, no respondemos de daños indirectos ni de decisiones tomadas a partir de los cálculos sin revisarlos. Nada de esto limita los derechos que te reconoce la ley como consumidor, si lo eres.</p>

      <h2>Baja</h2>
      <p>Puedes dejar de usar Fisquo y pedir que borremos tu cuenta cuando quieras. Podemos suspender cuentas que hagan un uso ilícito o abusivo del servicio.</p>

      <h2>Ley aplicable</h2>
      <p>Estas condiciones se rigen por la ley española. Para cualquier conflicto, los juzgados de Barcelona, salvo que la ley establezca otros.</p>

      <p className="legal-pie"><a href="/privacidad">Política de privacidad</a> · <a href="/aviso-legal">Aviso legal</a></p>
    </main>
  );
}
