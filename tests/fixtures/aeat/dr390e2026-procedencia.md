# Diseño oficial del modelo 390, ejercicio 2026

- Fuente: AEAT, `dr390e2026.xlsx`, versión 1.00.
- URL oficial: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_26/dr390e2026.xlsx
- Descargado por la oficina el 7 de noviembre de 2026 y copiado sin modificar desde
  `fisquo-oficina/auditorias/resumenes-anuales-2026/aeat-dr390e2026/`.
- Libro original: `dr390e2026.xlsx`, 556.940 bytes.
- SHA-256 del libro: `5ce047995347c2b5ad6e5d4e407f126eeb9bd214602ed7c99e9f85175176ec15`.
- `dr390e2026.txt` conserva el volcado de la oficina, hoja por hoja, con encabezados
  `===== HOJA: Pág. N =====` y columnas separadas por `|`.

Las pruebas de posiciones leen directamente este texto para todas las páginas de 2026
y siguientes, sin completar las tablas con el diseño de 2025 ni con una tabla manual.
El diseño de 2025 se conserva para las pruebas de ese ejercicio.

La Nota 2 de los campos numéricos indica que solo admiten cero. En la página 05,
los indicadores auxiliares alfanuméricos de las posiciones 1203 y 1204 tienen otra
Nota 2: admiten blanco, «1» o «2». Fisquo los deja en blanco porque no calcula ese régimen.
