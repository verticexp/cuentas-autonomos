# Procedencia de la tabla del modelo 390 de 2026

Esta copia conserva el extracto de posiciones de la revisión fiscal del 6 de noviembre de 2026 indicada en el encargo. No es una descarga nueva del XLSX ni una tabla deducida del generador de Fisquo.

- Documento de la oficina: `fisquo-oficina/auditorias/resumenes-anuales-2026/cambios-fichero390-2026.md`.
- Fuente que declara la revisión: diseño oficial `dr390e2026.xlsx`, versión 1.00.
- Enlace oficial confirmado en la Sede el 7 de noviembre de 2026: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_26/dr390e2026.xlsx
- Página de publicación: https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-300-399.html
- Copiado el 7 de noviembre de 2026. Se omiten propuestas de código y asuntos ajenos al diseño.
- La marca de carburantes utiliza `1` (Sí) / `2` (No), según esta extracción. No utiliza la letra `N`.

## Extracto conservado literalmente

# 390 de 2026: cambios en el fichero (para el equipo)

Fuente: diseño oficial `dr390e2026.xlsx` (vers. 1.00), Sede AEAT › Ayuda › Diseños de registro › Modelos 300-399,
«Ejercicio 2026 y siguientes». Origen normativo: Orden HAC/27/2026, de 22 de enero (BOE 26-1-2026, BOE-A-2026-1761),
anexo IV, de aplicación por primera vez al 390 del ejercicio 2026. Comparado con el de 2025 (vers. 1.02), copia en
`cuentas-autonomos-wt/codex-ficheros/dr-aeat/dr390.txt`.

## Qué cambia (y qué no)

Sin cambios: página 00 (sobre), 02 (1806), 02 bis (531), 03 (1840), 04 (854), 05 (1519) y 08 (1092). Mismo orden de
casillas que `CASILLAS390` y mismas casillas «solo cero» que `CEROS390` (comprobado casilla a casilla).

| Página | 2025 | 2026 | Qué pasa |
|---|---|---|---|
| 01 | 1187 | 1188 | Nueva marca en la 133: «Sujeto pasivo con derecho a deducir pago a cuenta de carburantes» (solo "1" o "2", no admite "0"). Todo lo que iba de la 133 en adelante se corre una posición. |
| 06 | 828 | 862 | Nueva casilla 112 (pago a cuenta de carburantes) en la 81 y, en el apartado 8, en la 225. 86 = 84 + 659 − 85 − 112. Se corre 17 posiciones desde la 81 y 34 desde la 225. |
| 07 | 776 | 781 | El código CNAE de cada prorrata pasa de 3 a 4 posiciones (CNAE-2025): cada bloque de prorrata mide 84 en vez de 83. |

### Página 01 (posiciones 2025 → 2026)

- 133 (2) sustitutiva + rectificación `'00'` → **133 = '2'** (carburantes: No) y **134 = '00'**.
- Actividad principal y otras: nombre 148 + i·47 → **149 + i·47**; clave 188 + i·47 → **189 + i·47**; IAE 191 + i·47 → **192 + i·47**.
- Marca del 347: 430 → **431**.
- Fechas de poder de los representantes (numéricas, a ceros): 734 / 843 / 952 → **735 / 844 / 953**.
- Fin de registro: 1176 → **1177** (`pagina()` lo calcula con la longitud).

### Página 06 (2026)

| Casilla | Posición | Tipo |
|---|---|---|
| 658 | 13 | N |
| 84 | 30 | N |
| 659 | 47 | Num |
| 85 | 64 | Num |
| **112** | **81** | Num |
| 86 | 98 | N |
| 87-91 (porcentajes) | 115 (5 × 5) | Num |
| 658, 84, 92, 659, 93, **112**, 94 (apartado 8) | 140, 157, 174, 191, 208, 225, 242 | N/Num |
| 95 … 108 (26 campos, mismo orden que hoy) | 259 + i·17 (108 en la 684) | Num hasta 526, N desde 99 |
| Reservado | 701 (150) | An |
| Fin | 851 | |

### Página 07 (2026)

Igual hasta la 199. Prorrata i (0-4): actividad 200 + i·84 (40), CNAE 240 + i·84 (4), importe 244 + i·84 (17),
con derecho 261 + i·84 (17), tipo 278 + i·84 (1), % 279 + i·84 (5). Reservado 620, fin 770.

