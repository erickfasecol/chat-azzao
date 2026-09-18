/**
 * Recibe los interesados del chat de AZZAO y los escribe en esta hoja.
 *
 * CÓMO INSTALARLO (5 minutos, gratis, no necesita tarjeta):
 *
 *  1. Entre a https://sheets.google.com y cree una hoja nueva.
 *     Nómbrela, por ejemplo, "Interesados AZZAO".
 *
 *  2. En el menú: Extensiones → Apps Script. Se abre una pestaña nueva.
 *
 *  3. Borre todo lo que aparezca ahí y pegue este archivo completo.
 *
 *  4. Guarde con el ícono del disquete.
 *
 *  5. Arriba a la derecha: botón azul "Implementar" → "Nueva implementación".
 *     - En el engranaje de la izquierda elija "Aplicación web".
 *     - "Ejecutar como": Yo (su correo).
 *     - "Quién tiene acceso": Cualquier usuario.   ← importante
 *     - Botón "Implementar".
 *
 *  6. Google le pide autorizar. Acepte. Si aparece una pantalla que dice
 *     "Google no ha verificado esta aplicación", haga clic en "Configuración
 *     avanzada" y luego en "Ir a (nombre) (no seguro)". Es su propio script,
 *     no hay riesgo.
 *
 *  7. Copie la "URL de la aplicación web" que le muestra al final. Se ve así:
 *     https://script.google.com/macros/s/AKfycb.../exec
 *
 *  8. Esa URL va en la variable HOJA_WEBHOOK del bot.
 *
 * Cada vez que alguien deje sus datos en el chat, aparece una fila acá.
 * Se crea una pestaña por tipo de registro, con sus encabezados.
 */

// Nombre de la pestaña según el tipo de registro que llegue.
var PESTANAS = {
  contactos: 'Lista de espera',
  pedidos: 'Intenciones de compra',
  escalados: 'Casos para asesor',
};

function doPost(e) {
  try {
    var datos = JSON.parse(e.postData.contents);
    var tipo = datos.tipo || 'contactos';
    delete datos.tipo;

    var nombrePestana = PESTANAS[tipo] || tipo;
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = libro.getSheetByName(nombrePestana);

    // Si la pestaña no existe, la crea con los encabezados de este registro.
    if (!hoja) {
      hoja = libro.insertSheet(nombrePestana);
      var encabezados = Object.keys(datos);
      hoja.appendRow(encabezados);
      hoja.getRange(1, 1, 1, encabezados.length)
          .setFontWeight('bold')
          .setBackground('#F2E8C9');
      hoja.setFrozenRows(1);
    }

    // Respeta el orden de columnas que ya tenga la hoja.
    var columnas = hoja.getRange(1, 1, 1, hoja.getLastColumn())
                       .getValues()[0]
                       .filter(function (c) { return c !== ''; });

    // Si llegó un campo nuevo que la hoja no tenía, lo agrega al final.
    Object.keys(datos).forEach(function (clave) {
      if (columnas.indexOf(clave) === -1) {
        columnas.push(clave);
        hoja.getRange(1, columnas.length).setValue(clave).setFontWeight('bold');
      }
    });

    var fila = columnas.map(function (c) {
      return datos[c] === undefined ? '' : datos[c];
    });
    hoja.appendRow(fila);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Para comprobar desde el navegador que la dirección quedó viva.
function doGet() {
  return ContentService.createTextOutput(
    'El receptor de AZZAO está funcionando. Esta dirección espera datos del chat.'
  );
}
