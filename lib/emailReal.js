import dns from 'node:dns/promises';
const TEMPORALES = new Set('mailinator.com guerrillamail.com 10minutemail.com tempmail.com temp-mail.org yopmail.com trashmail.com getnada.com dispostable.com sharklasers.com maildrop.cc throwawaymail.com fakeinbox.com'.split(' '));
const ERROR = 'Ese email no parece existir. Revisa que esté bien escrito.';
const inexistente = (e) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(e.code);

export async function emailReal(email, { resolver = dns } = {}) {
  const e = String(email || '').trim();
  if (e.length > 254 || !/^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(e)) return { ok: false, error: ERROR };
  const dominio = e.split('@')[1].toLowerCase();
  if ([...TEMPORALES].some((d) => dominio === d || dominio.endsWith(`.${d}`))) return { ok: false, error: 'No se admiten emails temporales.' };
  let timer;
  const consultar = async () => {
    try {
      const mx = await resolver.resolveMx(dominio);
      if (mx.some((r) => r.exchange && r.exchange !== '.')) return { ok: true };
      if (mx.length) return { ok: false, error: ERROR }; // MX nulo: el dominio no recibe correo.
    } catch (e) { if (!inexistente(e)) return { ok: true }; }
    for (const metodo of ['resolve4', 'resolve6']) {
      if (!resolver[metodo]) continue;
      try { if ((await resolver[metodo](dominio)).length) return { ok: true }; }
      catch (e) { if (!inexistente(e)) return { ok: true }; }
    }
    return { ok: false, error: ERROR };
  };
  try { return await Promise.race([consultar(), new Promise((ok) => { timer = setTimeout(() => ok({ ok: true }), 3000); })]); }
  finally { clearTimeout(timer); }
}
