// Identidad legal de quien está detrás de Fisquo (LSSI, art. 10, y declaración responsable de Verifactu). Está VACÍA a
// propósito: no se publica ningún dato que no sea real. Con titular, NIF y domicilio rellenos:
//  · el pie de la web enseña «titular · NIF · domicilio» y un enlace a /aviso-legal,
//  · /aviso-legal deja de dar 404 y publica los datos,
//  · /declaracion-responsable publica la declaración completa si además se rellenan la fecha y el lugar de firma.
// Si falta alguno de esos tres datos, no se enseña nada de lo anterior.
//
// Cómo rellenarlo (todo texto; lo que no se tenga, se deja en '' o null):
//  · titular: razón social o nombre y apellidos tal como constan en el NIF. Ejemplo: 'Fisquo Software SL'.
//  · nif: el NIF/CIF del titular.
//  · domicilio: dirección postal completa con código postal, población y provincia.
//  · email: correo para comunicaciones legales. Vacío = se usa el de contacto de la web (corporate@fisquo.com).
//  · registro: datos de inscripción si es una sociedad, p. ej.
//      { nombre: 'Registro Mercantil de Valencia', tomo: '1234', folio: '56', hoja: 'V-78901', inscripcion: '1.ª' }
//    Solo se pintan los campos que tengan valor. Con null no se enseña el apartado.
//  · declaracion: fecha y lugar de firma de la declaración responsable de Verifactu (p. ej. fecha: '2 de febrero de
//    2027', lugar: 'Valencia'). Solo se rellenan cuando la persona que representa a la entidad firma de verdad.
export const EMPRESA_LEGAL = {
  titular: '',
  nif: '',
  domicilio: '',
  email: '',
  registro: null,
  declaracion: { fecha: '', lugar: '' },
};
