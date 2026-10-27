// Prueba social de la web pública (portada y /precios). Está VACÍA a propósito: Fisquo no inventa opiniones, casos ni
// logos. Cada bloque (components/web/PruebaSocial.js) solo se pinta cuando aquí hay datos reales; mientras tanto no sale
// nada, ni títulos ni huecos. Para publicar algo basta con rellenar el archivo y desplegar.
//
// Reglas para rellenarlo:
//  · Solo personas y empresas reales, con su permiso por escrito (un correo vale) para salir en la web con su nombre,
//    su texto y su foto o logo. Los textos se copian tal cual los escribieron, sin retocarlos para que suenen mejor.
//  · Las cifras de un caso (ahorro de horas, euros…) las ha dado el cliente o salen de datos que se pueden enseñar;
//    si no se pueden comprobar, no se ponen.
//  · Las fotos y los logos van en public/ (por ejemplo public/web/opinion-marta.jpg) y aquí se pone la ruta que
//    empieza por «/». Con foto vacía, la opinión sale sin foto. Los logos de gestorías necesitan su autorización.
//  · Una entrada incompleta no se muestra (opiniones: nombre y texto; casos: empresa, problema y resultado;
//    gestorías: nombre; nota del fundador: nombre y texto), así un dato a medias no llega a la web.

// { nombre: 'Marta Ruiz', negocio: 'Estudio Norte', ciudad: 'Valencia', texto: 'Lo que dijo, tal cual.', foto: '/web/marta.jpg' }
export const opiniones = [];

// { empresa: 'Taller Ruiz SL', sector: 'Reparación de vehículos', problema: 'Lo que le pasaba.', resultado: 'Lo que cambió, con cifras reales.' }
export const casos = [];

// { nombre: 'Gestoría Pons', logo: '/web/gestoria-pons.svg' }  (sin logo, sale solo el nombre)
export const gestorias = [];

// Nota de quien fundó Fisquo, en primera persona y firmada. Con null no se muestra.
// { nombre: 'Nombre y apellidos', cargo: 'Fundador de Fisquo', texto: 'Lo que quiera contar.', foto: '/web/fundador.jpg' }
export const notaFundador = null;
