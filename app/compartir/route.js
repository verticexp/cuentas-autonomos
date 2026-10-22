// Sin el service worker, la bandeja explica que hay que volver a compartir.
export async function POST() {
  return new Response(null, { status: 303, headers: { Location: '/gastos/bandeja?compartido=sinsw' } });
}

export async function GET() { return POST(); }
