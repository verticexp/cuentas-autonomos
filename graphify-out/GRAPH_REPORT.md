# Graph Report - cuentas-autonomos  (2026-10-11)

## Corpus Check
- 278 files · ~132,667 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 38 file(s) not represented in the graph (top: .css 31, .xsd 4, (none) 1)

## Summary
- 1456 nodes · 5634 edges · 75 communities (69 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71

## God Nodes (most connected - your core abstractions)
1. `r2()` - 95 edges
2. `usuarioApi()` - 93 edges
3. `leer()` - 90 edges
4. `next` - 87 edges
5. `error()` - 85 edges
6. `importes()` - 81 edges
7. `eur()` - 81 edges
8. `puede()` - 70 edges
9. `numeroFactura()` - 67 edges
10. `cuerpo()` - 66 edges

## Surprising Connections (you probably didn't know these)
- `Nueva()` --calls--> `num`  [EXTRACTED]
  app/facturas/nueva/page.js → lib/formato.js
- `guardar()` --indirect_call--> `color()`  [INFERRED]
  components/Marca.js → lib/pdf.js
- `enviar()` --indirect_call--> `e()`  [INFERRED]
  components/Nominas.js → lib/verifactuXml.js
- `Pagina()` --calls--> `Solucion()`  [EXTRACTED]
  app/(web)/autonomos/page.js → components/web/Solucion.js
- `generateMetadata()` --calls--> `funcion()`  [EXTRACTED]
  app/(web)/funciones/[slug]/page.js → components/web/datos.js

## Import Cycles
- None detected.

## Communities (75 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (73): dynamic, GET(), POST(), dynamic, POST(), dynamic, POST(), dynamic (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (18): esquemas(), fault(), H, huella(), procesar(), valor(), b64d(), firma_ok() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (49): dynamic, GET(), abrirZip(), columna(), ENT, leerCsv(), leerHoja(), leerXlsx() (+41 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (32): metadata, metadata, metadata, RESPONSABLE, certificadoListo(), enviarLuego(), enviarPendientes(), enviarTodas() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (34): Casillas(), dynamic, menos(), MES, Modelos(), plazo(), T, Presentado202() (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (33): RFC-8291, ancho(), fecha(), imp(), norma43(), a4, alta2, conCuota (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (30): DE_EMPRESA, dynamic, Seccion(), TITULOS, llamar(), Ajustes(), CAMPOS, Formulario() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (30): dynamic, GET(), dynamic, masMes(), RegistroJornada(), duracion(), EditarJornada(), Fichar() (+22 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (30): DELETE(), dynamic, POST(), DELETE(), DELETE(), DELETE(), dynamic, PATCH() (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (18): Actividad(), cuando(), dynamic, dynamic, Page(), dynamic, Proveedor(), dynamic (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (22): dynamic, metadata, PresupuestoCliente(), dynamic, metadata, Portal(), dynamic, Presupuesto() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (22): POST(), Bienvenida(), dynamic, dynamic, PaginaBloqueo(), ConfirmarEmail(), dynamic, ABIERTA (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (19): dynamic, Factura(), dynamic, Empleado(), Borrar(), Cobrada(), cuando(), EnviarFactura() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (20): celda(), csv(), dynamic, GET(), num(), texto(), dynamic, GET() (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (23): FacturaA4(), baseLinea(), columnasLineas(), desglose(), esc(), facturaHtml(), tablaConceptos(), eurSin() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (22): dynamic, POST(), DELETE(), deMiEmpresa(), enlace(), esAdminDe(), invitar(), nombreEmpresa() (+14 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (17): diaMes(), dynamic, Facturas(), MESES, diaMes(), dynamic, Gastos(), MESES (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (16): POST(), dynamic, POST(), POST(), crear, dynamic, POST(), dynamic (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.20
Nodes (17): dynamic, ERRORES, Login(), avisar(), Bloqueo(), marcarAbierta(), FormEntrar(), entrar() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (17): dynamic, Nueva(), dynamic, Nominas(), dynamic, Nuevo(), dynamic, Presupuestos() (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (20): ChatEstatico(), Funciones(), metadata, VISUAL, dynamicParams, generateMetadata(), PaginaFuncion(), MEDIDAS (+12 more)

### Community 21 - "Community 21"
Cohesion: 0.19
Nodes (20): dynamic, POST(), dynamic, origenDe(), PATCH(), POST(), proveedorDe(), retencionDe() (+12 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (22): N(), AREAS, AsistenteDemo(), Calculadora(), CAMPOS, COBROS, ConciliacionDemo(), DEMOS (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (21): anioValido(), cifrasDe(), cifrasInventadas(), DATOS_DE, definiciones(), ejecutar(), euros(), fechaValida() (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (18): CAMPOS, DESTINO(), esc(), ETIQUETAS, POST(), origen(), POST(), ruta() (+10 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (17): metadata, PaginaPrecios(), CIFRAS, CINTA, MENUS, COMPARATIVA, CONTACTO, DESCUENTO (+9 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (16): Celda(), dynamic, Page(), dynamic, metadata, Resumen(), Presentado(), CambiarEmpresa() (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (18): dynamic, GET(), GIF, dynamic, maxDuration, PATCH(), POST(), dynamic (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (17): dynamic, POST(), dynamic, POST(), dynamic, metadata, Pagar(), importes() (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (15): claveProveedor(), proveedores(), totalDe(), claveConcepto(), claveGasto(), diaDelMes(), finTrimestre(), gastosHabituales() (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.19
Nodes (17): POST(), cambioIban(), CAMPOS, PATCH(), dynamic, GET(), json(), LISTAS (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (10): metadata, RootLayout(), viewport, Arranque(), BarraEstado(), fuente, Llegada(), avisarFin() (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (16): GET(), POST(), POST(), POST(), POST(), aceptarInvitacion(), confirmarEmail(), crearSesion() (+8 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (14): ACTIVIDADES, apartar(), diasEntre(), masDias(), proximoPlazo(), vencida(), vencimiento(), parseImporte() (+6 more)

### Community 34 - "Community 34"
Cohesion: 0.26
Nodes (15): dynamic, GET(), maxDuration, dynamic, GET(), maxDuration, purgarBajas(), emailListo() (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (16): ACTIVIDADES, ahora, azar(), CLIENTES, CONCEPTOS, elegir(), entre(), EVENTOS_MES (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (12): GET(), avisosDelDia(), lista(), masDias(), plazosFiscales(), modelo202(), fiscal, EMISOR (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (9): dynamic, POST(), dynamic, GET(), enlacePago(), delCliente(), nif(), portalDe() (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (12): dynamic, PaginaCatalogo(), dynamic, Gasto(), dynamic, Page(), Catalogo(), IMPLICA (+4 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (15): Cuestionario(), terminar(), IVAS, Opcion(), RETENCIONES, SiNo(), ACTIVIDADES_ANTIGUAS, DEDUCCIONES_GENERALES (+7 more)

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (12): Contacto(), metadata, PASOS, Fila(), Pantalla(), PANTALLAS, VentanaApp(), PASOS (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.23
Nodes (9): dynamic, Recurrentes(), CuotaIS(), GraficaCaja(), mayus(), AccionesRecurrente(), Rend130(), eur() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.27
Nodes (11): EntrarLlave(), entrar(), FaceId(), activar(), activarFaceId(), autofillDisponible(), entrarConFaceId(), faceIdDisponible() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.26
Nodes (10): dynamic, maxDuration, POST(), dynamic, maxDuration, POST(), iaLista(), leerTicket() (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.24
Nodes (9): metadata, Pagina(), metadata, Pagina(), metadata, Pagina(), segmento(), Solucion() (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (9): Avatar(), TONOS, ElegirPermisos(), Enlace(), Persona(), Usuarios(), limpiarPermisos(), PERFILES (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.42
Nodes (10): minoracion130(), resumenAnual(), suma(), trimestre(), usa130(), usa303(), panelResumen(), suma() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.40
Nodes (8): DELETE(), dynamic, GET(), POST(), avisosPush(), clavePublica(), enviarPush(), pushListo()

### Community 48 - "Community 48"
Cohesion: 0.42
Nodes (6): Dietas(), calcularDieta(), conceptoDieta(), KM, limiteDia(), MANUTENCION

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (6): LayoutWeb(), Cabecera(), fmt, Interacciones(), Marco(), Pie()

### Community 50 - "Community 50"
Cohesion: 0.44
Nodes (8): asuntoInvitacion(), destino(), enviarInvitacion(), esc(), htmlConfirmacion(), htmlInvitacion(), linea(), datos

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (10): dependencies, next, pdf-lib, qrcode, react, react-dom, @simplewebauthn/browser, @simplewebauthn/server (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.20
Nodes (7): claves, datos, r, [archivo, modo], { fecha, datos }, n, r

### Community 53 - "Community 53"
Cohesion: 0.31
Nodes (6): EXTRA, extraDe(), seccion(), TabBar(), TABS, vibrar()

### Community 54 - "Community 54"
Cohesion: 0.39
Nodes (7): calculoNomina(), gastoDeNomina(), MESES, modelo111(), SS_EMPRESA, SS_TRABAJADOR, ultimoDia()

### Community 55 - "Community 55"
Cohesion: 0.47
Nodes (7): fechaAeat(), horaMadrid(), huella(), QR, registroAlta(), total(), urlQr()

### Community 56 - "Community 56"
Cohesion: 0.36
Nodes (6): POST(), comprobar(), BORRAR_YA, CONSERVAR, darDeBaja(), GUARDAR

### Community 57 - "Community 57"
Cohesion: 0.32
Nodes (5): contentType, size, LETRAS, N_TRAZO, N_VISTA

### Community 58 - "Community 58"
Cohesion: 0.36
Nodes (5): dynamic, EJEMPLOS, PaginaAsistente(), Asistente(), herramientasPara()

### Community 59 - "Community 59"
Cohesion: 0.52
Nodes (6): dynamic, emailRepetido(), limpio(), PATCH(), pct(), POST()

### Community 60 - "Community 60"
Cohesion: 0.43
Nodes (5): aTexto(), FormPresupuesto(), lineasDe(), lineaVacia(), VACIO

### Community 61 - "Community 61"
Cohesion: 0.62
Nodes (5): cabeceraCsp(), modoCsp(), politicaCsp(), config, proxy()

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (6): name, private, react-dom, @simplewebauthn/browser, @simplewebauthn/server, web-push

### Community 63 - "Community 63"
Cohesion: 0.47
Nodes (4): dynamic, Invitacion(), CONOCIDOS, mensajeSeguro()

### Community 64 - "Community 64"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, verificar

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (4): @upstash/redis, escribir, pendientes, r

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (3): POST(), diagnostico(), enviar()

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): compilerOptions, baseUrl, paths

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (3): crons, ignoreCommand, regions

## Knowledge Gaps
- **2 isolated node(s):** `react-dom`, `RFC-8291`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 378 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Community 16` to `Community 0`, `Community 3`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 30`, `Community 31`, `Community 32`, `Community 37`, `Community 38`, `Community 40`, `Community 41`, `Community 42`, `Community 44`, `Community 45`, `Community 48`, `Community 49`, `Community 53`, `Community 57`, `Community 60`, `Community 61`, `Community 62`, `Community 70`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **What connects `react-dom`, `RFC-8291` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05826330532212885 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Community 18` to `Community 0`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 16`, `Community 19`, `Community 22`, `Community 25`, `Community 26`, `Community 31`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 45`, `Community 48`, `Community 49`, `Community 53`, `Community 58`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05004389815627744 - nodes in this community are weakly interconnected._
- **Why does `@upstash/redis` connect `Community 65` to `Community 17`, `Community 35`, `Community 52`, `Community 62`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06284153005464481 - nodes in this community are weakly interconnected._