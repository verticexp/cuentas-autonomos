# Navarra y País Vasco en Fisquo

Reglas en `lib/territorios.js`, comprobadas el 22-10-2026 en las webs y boletines de cada Hacienda (revisar cada año).
La empresa elige su territorio en el cuestionario («¿Dónde presentas tus impuestos?»); se guarda en `fiscal.territorio`.

El IVA se calcula igual en toda España: lo que cambia es el modelo, sus casillas y sus plazos. Por eso, en un territorio
foral, Impuestos enseña los importes sin la numeración de casillas de la AEAT, sin su fichero de importación y con el
enlace a la sede de la Hacienda foral.

## Modelos y plazos

| | Navarra | Bizkaia | Gipuzkoa | Álava |
|---|---|---|---|---|
| IVA trimestral | F-69: 20 abr, 5 ago, 20 oct, 31 ene | 303: día 25 | 300: día 25 | 303: día 25 |
| IVA del 4T | F-69 hasta el 31 ene (con el resumen anual como anexo) | En el 390, hasta el 31 ene | En el 390, hasta el 31 ene | En el 390, hasta el 31 ene |
| Pago fraccionado IRPF | 130, como el F-69 | 130, día 25 | 130, hasta el día 10 del mes siguiente | De oficio (la Diputación), día 10 del mes siguiente |
| Retenciones | 715 y 759 (alquiler), día 20 | 110 y 115, día 25 (4T: 25 ene) | 110 y 115, día 25 (4T: 31 ene) | 110 y 115-A, día 25 (4T: 31 ene) |
| Sociedades | S-90; pago S-91 hasta el 20 oct | 200; pago 203 hasta el 25 oct | 200; pago 203 hasta el 25 oct | 200; pago 203 hasta el 25 oct |

Si el plazo cae en sábado, domingo o festivo, pasa al siguiente día hábil. Cuando dos fuentes oficiales no coinciden
(el 4T de Bizkaia: reglamento 25 de enero, calendario 31), Fisquo usa el plazo más corto.

## Pago fraccionado del IRPF (estimación directa)

- **Navarra** (Reglamento del IRPF, art. 92): sobre todo el rendimiento neto del penúltimo año, el 6 % (de 6.500 a
  12.000 €), 12 % (hasta 24.000), 18 % (hasta 36.000) o 24 % (más), menos sus retenciones, en cuatro partes. Sin
  rendimiento del penúltimo año (primeros años), la modalidad 2: el mismo porcentaje sobre el rendimiento del año.
- **Bizkaia** (DF 47/2014, art. 110): 5 % del rendimiento neto del penúltimo año menos el 25 % de sus retenciones; sin
  rendimiento positivo, el 0,5 % de las ventas de ese año; el año de inicio y el siguiente, el 20 % de lo del trimestre
  menos sus retenciones. Sin pago si al menos el 70 % de lo facturado lleva retención.
- **Gipuzkoa** (DF 33/2014): 5 % del rendimiento neto del penúltimo año menos una cuarta parte de sus retenciones. Sin
  pago si al menos el 50 % lleva retención.
- **Álava** (DF 40/2014, art. 106): lo liquida la Diputación de oficio (5 % del penúltimo año menos una cuarta parte de
  sus retenciones); el año de inicio se presenta el 130 con el 5 % del rendimiento del trimestre.
- **1T de 2026**: exonerado en Bizkaia (DFN 1/2026), Gipuzkoa (DF-Norma 2/2026) y Álava (DNUF 2/2026). En Navarra no.

El rendimiento del penúltimo año sale de las facturas y gastos de Fisquo si hay datos de ese año; si no, se puede escribir
en Impuestos (`rend130[año]`).

## Impuesto sobre Sociedades

- **País Vasco**: 24 % general y 20 % las micro y pequeñas empresas (hasta 10 M€ de cifra de negocios, con requisitos de
  plantilla y activo que Fisquo no conoce). Pago fraccionado 203 en octubre: 5 % de la base imponible del último periodo;
  no lo pagan las micro y pequeñas.
- **Navarra** (Ley Foral 26/2016, arts. 12 y 51): 28 % general (25 % con requisitos de empleo, no aplicado), 23 % la
  pequeña empresa (menos de 20 M€) y 19 % la microempresa (hasta 1 M€). Pago fraccionado S-91 en octubre: 30 % de la cuota
  efectiva del último periodo.

## Lo que Fisquo no hace en territorio foral

- **TicketBAI** (País Vasco): las facturas deben salir de un programa dado de alta en el registro de software TicketBAI,
  con firma, encadenamiento y código QR. El alta va a nombre de la empresa que desarrolla Fisquo: hasta tenerla, la app
  avisa al facturar de que se emitan con un programa TicketBAI y se importen después.
- Módulos y régimen simplificado (cada Hacienda tiene los suyos), la renta (109 en el País Vasco, F-90 en Navarra, con su
  propia escala) y las casillas exactas de cada modelo foral.
