// Proveedor IA ficticio, exclusivamente local. No accede a Anthropic ni necesita claves reales.
import http from 'node:http';
export async function arrancarIA(puerto = 18720) {
  const estado = { conteos: 0, inferencias: 0, entrada: 2000, salida: 600, falloConteo: false, falloInferencia: false, respuestaInvalida: false };
  const servidor = http.createServer(async (req, res) => {
    const trozos = []; for await (const x of req) trozos.push(x);
    const body = JSON.parse(Buffer.concat(trozos).toString() || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/messages/count_tokens') {
      estado.conteos++;
      if (estado.falloConteo) { res.statusCode = 503; res.end(JSON.stringify({ error: { message: 'Conteo simulado no disponible' } })); return; }
      res.end(JSON.stringify({ input_tokens: estado.entrada })); return;
    }
    if (req.url !== '/v1/messages') { res.statusCode = 404; res.end('{}'); return; }
    estado.inferencias++;
    if (estado.falloInferencia) { res.statusCode = 503; res.end(JSON.stringify({ error: { message: 'Fallo simulado' } })); return; }
    const banco = body.messages?.[0]?.content?.some(c => c.text?.includes('extracto bancario'));
    const datos = banco ? { movimientos: [{ fecha: '2026-10-18', concepto: 'Cobro ficticio', importe: 121, saldo: 121 }] }
      : { proveedor: 'Proveedor ficticio', concepto: 'Material de prueba', fecha: '2026-10-18', base: 100, ivaPct: 21, total: 121 };
    res.end(JSON.stringify({ model: body.model, usage: { input_tokens: estado.entrada, output_tokens: estado.salida }, content: [{ type: 'text', text: estado.respuestaInvalida ? 'Respuesta ilegible' : JSON.stringify(datos) }] }));
  });
  await new Promise(resolve => servidor.listen(puerto, '127.0.0.1', resolve));
  return { estado, cerrar: () => new Promise(resolve => { servidor.closeAllConnections?.(); servidor.close(resolve); }) };
}
