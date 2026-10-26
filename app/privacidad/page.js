import '@/app/legal.css';
import VolverLegal from '@/components/VolverLegal';
import { EMPRESA_LEGAL } from '@/data/empresa-legal';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Privacidad' };
const EMAIL = EMPRESA_LEGAL.email || CONTACTO;

export default function Privacidad() {
  return (
    <main className="legal">
      <VolverLegal />
      <h1>Política de privacidad</h1>
      <p className="legal-fecha">Última actualización: 26 de octubre de 2026</p>

      <h2>Quién trata tus datos</h2>
      <p>{EMPRESA_LEGAL.titular} (NIF {EMPRESA_LEGAL.nif}), con domicilio en {EMPRESA_LEGAL.domicilio}, es la responsable de Fisquo. Para cualquier cuestión sobre tus datos: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Tu cuenta: nombre, email, contraseña (cifrada), llaves de acceso del dispositivo y, si activas la verificación en dos pasos, su clave.</li>
        <li>Las últimas entradas a tu cuenta (fecha, IP y dispositivo), para que puedas ver en Ajustes si alguien ha entrado sin ti.</li>
        <li>Los datos de tu empresa que introduces: facturas, presupuestos, clientes, proveedores, gastos y tickets, nóminas, empleados y su registro de jornada.</li>
        <li>Si conectas tu banco: saldos y movimientos de las cuentas que autorices. Fisquo solo puede leerlos; nunca puede mover dinero.</li>
        <li>Las preguntas que haces al asistente y sus respuestas.</li>
        <li>Si contratas un plan: los datos de facturación de tu suscripción. Los datos de la tarjeta los guarda Stripe; Fisquo no los ve.</li>
      </ul>

      <h2>Para qué y con qué base</h2>
      <ul>
        <li>Prestarte el servicio: llevar tus cuentas, calcular impuestos y modelos, emitir facturas, emparejar movimientos del banco con facturas y gastos, avisarte de plazos y responder al asistente. Base: el contrato que aceptas al usar Fisquo.</li>
        <li>Proteger tu cuenta: verificación en dos pasos, registro de accesos y límites contra abusos. Base: interés legítimo en la seguridad del servicio.</li>
        <li>Cumplir lo que la ley obliga: conservar facturas y documentación contable (Código de Comercio y normativa fiscal), el registro de jornada (art. 34.9 del Estatuto de los Trabajadores, 4 años) y remitir a la Agencia Tributaria los registros de facturación de Verifactu de las facturas que emites. Base: obligación legal.</li>
      </ul>
      <p>No vendemos tus datos, no hacemos publicidad ni perfiles comerciales y no los usamos para entrenar modelos de inteligencia artificial.</p>

      <h2>Datos de tus clientes, proveedores y empleados</h2>
      <p>De los datos personales que metes en Fisquo sobre otras personas (tus clientes, proveedores o empleados), el responsable eres tú, y {EMPRESA_LEGAL.titular} actúa como encargada del tratamiento (art. 28 del RGPD): solo los trata para prestarte el servicio y siguiendo tus instrucciones, con confidencialidad, con las medidas de seguridad adecuadas y con los proveedores de abajo. Cuando des de baja tu cuenta, los borra salvo lo que la ley obligue a conservar, y puedes descargarlos antes.</p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores necesarios para que Fisquo funcione, que actúan como encargados del tratamiento:</p>
      <ul>
        <li>Vercel (alojamiento de la aplicación y de los archivos que subes) y Upstash (base de datos).</li>
        <li>Enable Banking Oy (Finlandia), proveedor autorizado de información de cuentas, si conectas tu banco.</li>
        <li>Anthropic (inteligencia artificial), para responder al asistente, leer los tickets y facturas que subes y reconocer las columnas de los archivos que importas.</li>
        <li>Resend, para enviar y recibir emails (facturas, recordatorios y facturas de gasto que reenvías a Fisquo).</li>
        <li>Stripe, para cobrar tu suscripción y, si lo activas, para que cobres tus facturas con tarjeta.</li>
        <li>Los servicios de notificaciones de tu navegador o móvil (Apple, Google o Mozilla), si activas los avisos.</li>
      </ul>
      <p>Además, la Agencia Tributaria recibe los registros de facturación de Verifactu, por obligación legal. Y si das acceso a tu gestoría o a otras personas de tu equipo, verán los datos que les permitas.</p>
      <p>Algunos proveedores están fuera del Espacio Económico Europeo; en esos casos la transferencia se ampara en las cláusulas contractuales tipo de la Comisión Europea o en el Marco de Privacidad de Datos UE-EE. UU.</p>

      <h2>Cuánto tiempo</h2>
      <p>Mientras tengas la cuenta. Si la cierras, borramos tus datos, salvo lo que la ley obliga a conservar durante el plazo legal. Del registro de accesos guardamos solo las 30 últimas entradas. La conexión con el banco caduca sola (normalmente a los 90 o 180 días) y puedes cortarla cuando quieras desde Fisquo.</p>

      <h2>Tus derechos</h2>
      <p>Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Si crees que no se han respetado, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">aepd.es</a>).</p>

      <h2>Cookies</h2>
      <p>Fisquo solo usa cookies técnicas imprescindibles: la de tu sesión, la de la empresa con la que estás trabajando y, mientras entras, la de la verificación en dos pasos. No usa cookies de análisis ni de publicidad.</p>

      <p className="legal-pie"><a href="/condiciones">Condiciones de uso</a> · <a href="/aviso-legal">Aviso legal</a></p>
    </main>
  );
}
