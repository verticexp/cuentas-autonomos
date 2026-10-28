# La app en castellano, catalán e inglés

El idioma de la app es el del iPhone o el navegador (cabecera `Accept-Language`), o el que se elija en
**Ajustes › Idioma** (cookie `idioma`). El de las facturas es otra cosa: va por cliente (`lib/idiomas.js`).

## Cómo funciona

- **El castellano es el código.** Cada texto se traduce buscando el texto en castellano, tal cual, en el diccionario.
  Si no está, sale en castellano. En castellano todo queda exactamente igual que antes.
- **Diccionarios:** `lib/textos/<zona>.js`, registrados en `lib/textos/index.js`. Cada entrada es
  `"texto en castellano": ["catalán", "inglés"]`. Una cadena vacía deja el castellano en ese idioma.
- **Componentes cliente:** `import { useT } from '@/components/Idioma';` y `const tr = useT();` arriba del componente.
- **Componentes y páginas del servidor:** `import { textos } from '@/lib/idiomaServidor';` y `const tr = await textos();`.
- **Metadatos:** `export async function generateMetadata() { return { title: (await textos())('Facturas') }; }`.
- Siempre `tr`, nunca `t`: en el código hay muchas variables `t` (pestañas, trimestres, totales) y se pisarían.

## Reglas para no romper nada

1. **Se traduce al pintar, nunca antes.** Solo pasa por `tr()` lo que se enseña: texto de JSX, `aria-label`,
   `placeholder`, `title`, `alt`, `confirm()`/`alert()` y el título de la página. Nunca cambian el estado, los valores
   que se comparan (`msg === 'Guardado'`), los `value` de los `<option>`, lo que se manda a la API, las claves, los ids,
   las clases ni las URL.
2. **El castellano no cambia ni una coma.** Ni espacios, ni comillas «», ni puntos suspensivos (…), ni mayúsculas.
3. **Textos con datos:** `` `Plazo en ${d} días` `` pasa a `tr('Plazo en {n} días', { n: d })`, que en castellano da lo
   mismo. Si el texto viene ya compuesto de otra parte (un mensaje de `lib/`, un error de la API), se traduce donde se
   pinta, `tr(msg)`, y en el diccionario va con huecos: `"Plazo en {n} días"`. Con huecos, el texto se reconoce ya
   compuesto solo si su parte fija tiene al menos 6 letras.
4. **Frases enteras, nunca a trozos.** No se traduce «Cobrado» + «de» + «· faltan» por separado: cada idioma ordena la frase
   a su manera. Se traduce la frase entera con huecos, `tr('Cobrado {pagado} de {total} · faltan {pendiente}', {...})`, y si
   un hueco es un elemento (`<strong>`, un enlace) se monta con `conHuecos` de `lib/huecos.js`. El texto en castellano que
   se ve tiene que quedar idéntico, espacios incluidos. Los huecos llevan nombres que digan qué son (`{importe}`, `{fecha}`),
   no `{v1}`.
5. **Plurales:** cada forma, su entrada (`'{n} día'` y `'{n} días'`).
   **Una palabra con dos sentidos** («Activo»: encendido, o el activo del balance): `tr('Activo', { contexto: 'balance' })`
   y en el diccionario `"Activo@balance"`; sin esa entrada se usa la de «Activo».
6. **Hooks:** `useT()` solo arriba de un componente. Una función auxiliar que no es componente recibe `tr` como parámetro.
7. **No se traducen:** los PDF y documentos de factura (ya tienen su idioma por cliente), los correos y avisos push (aún
   no saben el idioma de quien los recibe), las exportaciones CSV/Excel y los ficheros para Hacienda, el panel `/admin`, los
   nombres propios (Fisquo, Verifactu, Google Drive, WhatsApp, Stripe) ni los datos del usuario.

## Estilo

- **No se traduce palabra por palabra.** Cada frase se escribe como la escribiría alguien de ese idioma en una app
  cuidada: si en inglés suena mejor «Snap a receipt» que «Photo of a ticket», va lo primero.
- **Catalán:** normativo (IEC), con tuteo como en castellano. Botones y acciones en imperativo: Desa, Cancel·la, Envia,
  Esborra, Edita, Baixa, Puja, Torna-ho a provar. Cometes « ». «S'està desant…» para los gerundios de espera.
- **Inglés:** británico (*catalogue*, *favourites*, *licence*), en tono cercano y claro, con contracciones (*you're*,
  *can't*) y mayúscula solo al principio de la frase (*Save changes*, no *Save Changes*).
- **Nombres oficiales españoles, tal cual:** Modelo 303, IRPF, IGIC, NIF, Verifactu, AEAT, Seguridad Social. En
  inglés, si hace falta, con una aclaración corta la primera vez: «Modelo 303 (VAT return)». «Hacienda» es «Hisenda» en
  catalán y «the tax office» o «AEAT» en inglés. El IVA es «IVA» en catalán y «VAT» en inglés (el mismo impuesto).

## Glosario

| Castellano | Catalán | Inglés |
|---|---|---|
| Resumen | Resum | Overview |
| Factura / Facturas | Factura / Factures | Invoice / Invoices |
| Factura rectificativa | Factura rectificativa | Corrective invoice |
| Factura simplificada | Factura simplificada | Simplified invoice |
| Gasto / Gastos | Despesa / Despeses | Expense / Expenses |
| Ajustes | Configuració | Settings |
| Presupuesto | Pressupost | Quote |
| Albarán | Albarà | Delivery note |
| Pedido | Comanda | Order |
| Cliente | Client | Client (*customer* si es una tienda) |
| Proveedor | Proveïdor | Supplier |
| Cobro / Cobrar | Cobrament / Cobrar | Payment received / Get paid |
| Pago / Pagar | Pagament / Pagar | Payment / Pay |
| Vencimiento | Venciment | Due date |
| Cartera de cobros | Cartera de cobraments | Receivables |
| Tesorería | Tresoreria | Cash flow |
| Remesa | Remesa | Direct debit batch |
| Conciliar | Conciliar | Reconcile |
| Movimiento (del banco) | Moviment | Transaction |
| Extracto | Extracte | Bank statement |
| Ticket | Tiquet | Receipt |
| TPV | TPV | Card terminal |
| Cierre de caja | Tancament de caixa | Cash-up |
| Catálogo | Catàleg | Catalogue |
| Inventario / Stock | Inventari / Estoc | Inventory / Stock |
| Gestoría | Gestoria | Accountant (*accounting firm* si hace falta) |
| Mi despacho | El meu despatx | My practice |
| Autónomo | Autònom | Self-employed |
| Sociedad | Societat | Company |
| Pyme | Pime | SME |
| Plan / Prueba | Pla / Prova | Plan / Trial |
| Impuestos / Modelos | Impostos / Models | Taxes / Tax forms |
| Plazo | Termini | Deadline (*due* en avisos cortos) |
| Trimestre | Trimestre | Quarter |
| Pago fraccionado | Pagament fraccionat | Payment on account |
| Base imponible | Base imposable | Taxable base |
| Cuota (de IVA) | Quota | VAT amount |
| Retención | Retenció | Withholding |
| Recargo de equivalencia | Recàrrec d'equivalència | Equivalence surcharge |
| Amortización | Amortització | Depreciation |
| Asiento | Assentament | Journal entry |
| Libro diario / mayor | Llibre diari / major | Journal / General ledger |
| Cuentas anuales | Comptes anuals | Annual accounts |
| Nómina | Nòmina | Payslip (*payroll* para el conjunto) |
| Registro de jornada / Fichar | Registre de jornada / Fitxar | Time tracking / Clock in |
| Guardar / Cancelar | Desa / Cancel·la | Save / Cancel |
| Borrar / Eliminar | Esborra / Elimina | Delete |
| Descargar / Subir | Baixa / Puja | Download / Upload |
| Atrás | Enrere | Back |

Antes de añadir un texto, mirar `lib/textos/comun.js` y `lib/textos/navegacion.js`: el mismo texto en castellano se
traduce igual en toda la app (`tests/idiomas-app.test.mjs` lo comprueba).
