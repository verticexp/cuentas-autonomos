import '@/app/legal.css';

export const metadata = { title: 'Privacidad · Netto' };
const RESPONSABLE = { nombre: 'Marc Ramírez Delgado', email: 'corporate@nettohq.com' };

export default function Privacidad() {
  return (
    <main className="legal">
      <a className="legal-volver" href="/">Netto</a>
      <h1>Política de privacidad</h1>
      <p className="legal-fecha">Última actualización: 5 de octubre de 2026</p>

      <h2>Quién trata tus datos</h2>
      <p>{RESPONSABLE.nombre}, responsable de Netto. Para cualquier cuestión sobre tus datos: <a href={`mailto:${RESPONSABLE.email}`}>{RESPONSABLE.email}</a>.</p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Tu cuenta: nombre, email, contraseña (cifrada) y, si las usas, llaves de acceso del dispositivo.</li>
        <li>Los datos de tu empresa que introduces: facturas, presupuestos, clientes, proveedores, gastos y tickets, nóminas, empleados y su registro de jornada.</li>
        <li>Si conectas tu banco: saldos y movimientos de las cuentas que autorices. Netto solo puede leerlos; nunca puede mover dinero.</li>
        <li>Las preguntas que haces al asistente y sus respuestas.</li>
      </ul>

      <h2>Para qué y con qué base</h2>
      <ul>
        <li>Prestarte el servicio: llevar tus cuentas, calcular impuestos y modelos, emitir facturas, emparejar movimientos del banco con facturas y gastos y responder al asistente. Base: el contrato que aceptas al usar Netto.</li>
        <li>Conservar lo que la ley obliga: facturas y documentación contable (Código de Comercio y normativa fiscal) y el registro de jornada (art. 34.9 del Estatuto de los Trabajadores, 4 años). Base: obligación legal.</li>
      </ul>
      <p>No vendemos tus datos, no hacemos publicidad ni perfiles comerciales y no los usamos para entrenar modelos de inteligencia artificial.</p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores necesarios para que Netto funcione, que actúan como encargados del tratamiento:</p>
      <ul>
        <li>Vercel (alojamiento de la aplicación) y Upstash (base de datos).</li>
        <li>Enable Banking Oy (Finlandia), proveedor autorizado de información de cuentas, si conectas tu banco.</li>
        <li>Anthropic (inteligencia artificial), para responder al asistente y leer los tickets que fotografías.</li>
        <li>Resend, para enviar emails (facturas y recordatorios), y Stripe, si cobras facturas con tarjeta.</li>
      </ul>
      <p>Algunos están fuera del Espacio Económico Europeo; en esos casos la transferencia se ampara en las cláusulas contractuales tipo de la Comisión Europea o en el Marco de Privacidad de Datos UE-EE. UU.</p>

      <h2>Cuánto tiempo</h2>
      <p>Mientras tengas la cuenta. Si la cierras, borramos tus datos, salvo lo que la ley obliga a conservar durante el plazo legal. La conexión con el banco caduca sola (normalmente a los 90 o 180 días) y puedes cortarla cuando quieras desde Netto.</p>

      <h2>Tus derechos</h2>
      <p>Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a <a href={`mailto:${RESPONSABLE.email}`}>{RESPONSABLE.email}</a>. Si crees que no se han respetado, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener">aepd.es</a>).</p>

      <h2>Cookies</h2>
      <p>Netto solo usa cookies técnicas imprescindibles: la de tu sesión y la de la empresa con la que estás trabajando. No usa cookies de análisis ni de publicidad.</p>

      <p className="legal-pie"><a href="/condiciones">Condiciones de uso</a></p>
    </main>
  );
}
