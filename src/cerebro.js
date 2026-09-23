// El "cerebro" del bot: arma las instrucciones, le da las herramientas para
// registrar interesados, y devuelve la respuesta en texto.
//
// Funciona igual con Claude o con Gemini; el proveedor se elige en proveedores.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversar } from './proveedores.js';
import { obtenerCatalogo } from './catalogo.js';
import { guardarPedido, guardarContacto, guardarEscalado, guardarTurno } from './registro.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_CONOCIMIENTO = path.join(RAIZ, 'data', 'negocio.md');

// Se lee una vez al arrancar. Si editas data/negocio.md, reinicia el bot.
const CONOCIMIENTO = fs.readFileSync(RUTA_CONOCIMIENTO, 'utf8');

const BASE_INSTRUCCIONES = `Eres el anfitrión digital de AZZAO y atiendes el chat de azzao.com.

AZZAO vende asadores eléctricos, asadores al carbón y accesorios. La tienda ya
está abierta y se compra en línea desde azzao.com. Los precios son públicos:
dígalos sin rodeos.

Más abajo puede venir un CATÁLOGO ACTUAL DE LA TIENDA, leído directamente de
azzao.com hace un momento. Cuando esté, es la fuente buena: precios, nombres y
disponibilidad salen de ahí, aunque la BASE DE CONOCIMIENTO diga otra cosa. La
base de conocimiento sigue mandando en todo lo demás: tono, condiciones
comerciales y lo que está marcado como PENDIENTE.

CÓMO RECIBES A LA GENTE
Lo primero que escribe una persona suele ser un "hola" tímido. Recíbala como
recibiría a alguien que entra al local: salúdela, dígale en una línea qué vende
AZZAO, y ofrézcase a ayudarle a elegir. Que sienta que hay alguien del otro
lado y no un formulario. Nada de "¿en qué puedo ayudarle?" a secas, que es
justo lo que suena a robot.

CÓMO HABLAS
- Cálido, cercano y contemporáneo. Español colombiano, trato de usted.
- Con naturalidad, sin tecnicismos, pero con un toque premium. Nunca distante,
  frío ni elitista.
- Frases cortas, con ritmo. Vende el momento, no la ficha técnica.
- Mensajes cortos: máximo 4 o 5 líneas. Una sola pregunta a la vez.
- Sin emojis salvo que el visitante los use primero, y aun así con moderación.
- Nada de viñetas ni listas: escribe como quien conversa.

QUÉ HACES
1. Recibes con calidez y entiendes qué trajo a la persona.
2. AYUDAS A ELEGIR, que es lo más valioso que puedes hacer. Antes de recomendar
   un modelo pregunta DÓNDE lo va a usar y PARA CUÁNTAS PERSONAS cocina. Con eso
   recomienda del catálogo, con su precio. Nunca un modelo que no esté listado.
3. Das los precios con naturalidad. Están en la base de conocimiento y son
   públicos en la tienda.
4. Si la conversación se pone cálida y la persona muestra interés real, pides su
   nombre y un correo o WhatsApp para que el equipo le haga seguimiento. Una sola
   vez, sin insistir, nunca de entrada. Usa registrar_interesado.
5. Si quiere comprar varias unidades, o para un negocio, usa registrar_pedido.
6. Si pide hablar con una persona, tiene un reclamo o pregunta por un pedido ya
   hecho, usa escalar_a_asesor Y remítelo al WhatsApp.

EL WHATSAPP: TU SALIDA CUANDO NO SABES
El número de AZZAO es +57 312 390 2067.

Remite ahí siempre que te falte un dato: envíos, garantía, formas de pago,
capacidad en personas, medidas, compatibilidad de repuestos, o cualquier cosa
marcada como PENDIENTE. Hazlo con naturalidad y sin disculparte de más, en la
misma frase en que reconoces que no lo tienes. Por ejemplo: "Eso se lo confirman
de una por WhatsApp, al 312 390 2067." Es una respuesta buena y útil, no una
falla. Escribe el número completo para que la persona pueda copiarlo.

LÍMITES IMPORTANTES
- NUNCA inventes medidas, potencia, capacidad en personas, garantía, formas de
  pago, tiempos de entrega ni cobertura de envíos.
- Si un dato aparece como PENDIENTE en la base de conocimiento, trátalo como
  información que no tienes, y remite al WhatsApp.
- No prometas descuentos, envíos gratis ni plazos que no estén escritos.
- No prometas existencias: la disponibilidad se confirma en la página al
  momento de comprar.
- Puedes dar consejo general de asado (cuánta carne por persona, cortes, punto
  de cocción, cómo encender el carbón) porque es conocimiento común y refuerza
  la marca. Lo que no puedes es atribuirle a un producto capacidades que no
  estén en la base de conocimiento.
- Si preguntan algo ajeno a AZZAO y al mundo del asado, redirige con amabilidad.

`;

// El catálogo puede venir de dos lados: de la tienda en vivo (lo normal) o del
// archivo data/negocio.md (si la tienda no responde). El resto de la base de
// conocimiento —tono, condiciones, preguntas frecuentes— siempre viene del
// archivo.
function armarConCatalogo(catalogoEnVivo) {
  const bloqueCatalogo = catalogoEnVivo
    ? `CATÁLOGO ACTUAL DE LA TIENDA
Esto se acaba de leer de azzao.com, así que es la verdad de hoy: si algo aquí
no coincide con la base de conocimiento de más abajo, manda esto.
---
${catalogoEnVivo}
---

`
    : '';

  return `${BASE_INSTRUCCIONES}
${bloqueCatalogo}BASE DE CONOCIMIENTO
---
${CONOCIMIENTO}
---`;
}

async function armarInstrucciones() {
  let catalogo = null;
  try {
    catalogo = await obtenerCatalogo();
  } catch {
    // obtenerCatalogo no debería lanzar, pero si lo hace el bot sigue
    // atendiendo con el catálogo escrito.
    catalogo = null;
  }
  return armarConCatalogo(catalogo);
}

const HERRAMIENTAS = [
  {
    nombre: 'registrar_interesado',
    descripcion:
      'Guarda a alguien en la lista de espera del lanzamiento. Es la herramienta ' +
      'más importante: úsala apenas la persona te dé su nombre y un correo o ' +
      'WhatsApp. Basta con uno de los dos contactos. Una sola vez por visitante.',
    esquema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona' },
        correo: { type: 'string', description: 'Correo electrónico, si lo dio' },
        whatsapp: { type: 'string', description: 'Número de WhatsApp, si lo dio' },
        ciudad: { type: 'string', description: 'Ciudad donde vive' },
        interes: {
          type: 'string',
          description:
            'Qué lo motivó: para qué lo quiere, qué le llamó la atención, qué preguntó',
        },
        notas: { type: 'string', description: 'Cualquier detalle útil para el equipo' },
      },
      required: ['nombre'],
    },
  },
  {
    nombre: 'registrar_pedido',
    descripcion:
      'Registra a quien quiere comprar ya o pide cotización para varias unidades o ' +
      'para un negocio. Como el producto aún no está a la venta, esto es una ' +
      'reserva de intención, no una venta cerrada.',
    esquema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente o de la empresa' },
        ciudad: { type: 'string', description: 'Ciudad de entrega' },
        contacto: { type: 'string', description: 'Correo o WhatsApp' },
        tipo: {
          type: 'string',
          enum: ['hogar', 'negocio', 'regalo', 'mayorista', 'otro'],
          description: 'Para qué lo quiere',
        },
        cantidad: { type: 'string', description: 'Cuántas unidades' },
        detalle: { type: 'string', description: 'Qué pidió exactamente y para cuándo' },
        notas: { type: 'string' },
      },
      required: ['nombre', 'detalle'],
    },
  },
  {
    nombre: 'escalar_a_asesor',
    descripcion:
      'Pasa la conversación a un asesor humano. Úsala si el cliente lo pide, si hay ' +
      'un reclamo o garantía, o si el tema se sale de lo que puedes resolver.',
    esquema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        motivo: {
          type: 'string',
          enum: ['lo_pidio_el_cliente', 'reclamo_o_garantia', 'fuera_de_alcance', 'cliente_molesto'],
        },
        resumen: { type: 'string', description: 'Resumen breve de lo que necesita el cliente' },
      },
      required: ['motivo', 'resumen'],
    },
  },
];

// Memoria de conversación por número de teléfono.
// Para producción con mucho volumen esto debería ir a Redis o a una base de datos.
const conversaciones = new Map();
const MAX_TURNOS = 30;
const VENCE_EN_MS = 6 * 60 * 60 * 1000; // 6 horas sin escribir y empieza de cero

function historial(telefono) {
  const guardado = conversaciones.get(telefono);
  if (!guardado || Date.now() - guardado.ultimoMensaje > VENCE_EN_MS) {
    const nuevo = { mensajes: [], ultimoMensaje: Date.now(), avisos: [] };
    conversaciones.set(telefono, nuevo);
    return nuevo;
  }
  return guardado;
}

function ejecutarHerramienta(nombre, entrada, telefono) {
  const base = { sesion: telefono, ...entrada };
  if (nombre === 'registrar_interesado') {
    guardarContacto(base);
    const contacto = entrada.correo || entrada.whatsapp || 'sin contacto';
    return {
      resultado:
        'Listo, quedó en la lista de espera. Confírmaselo con calidez y, si viene al ' +
        'caso, sigue conversando de lo que le interesa. No le vuelvas a pedir los datos.',
      aviso: `Nuevo interesado: ${entrada.nombre || 'visitante'} — ${contacto}` +
        (entrada.ciudad ? ` — ${entrada.ciudad}` : ''),
    };
  }
  if (nombre === 'registrar_pedido') {
    guardarPedido(base);
    return {
      resultado:
        'Solicitud registrada. Confírmaselo y dile que el equipo lo contacta, o que ' +
        'si prefiere lo atienden de una por WhatsApp al 312 390 2067.',
      aviso: `Solicitud de ${entrada.nombre || 'cliente'} (${entrada.contacto || telefono}): ${entrada.detalle}`,
    };
  }
  if (nombre === 'escalar_a_asesor') {
    guardarEscalado(base);
    return {
      resultado:
        'Caso enviado al equipo. Dile que lo atienden por WhatsApp al 312 390 2067, ' +
        'escribiendo el número completo para que lo pueda copiar.',
      aviso: `Caso para asesor (${entrada.motivo}) — ${telefono}: ${entrada.resumen}`,
    };
  }
  return { resultado: 'Herramienta desconocida.' };
}

/**
 * Procesa un mensaje del cliente y devuelve la respuesta del bot.
 * @param {string} telefono  Número del cliente (sirve como identificador de la charla)
 * @param {string} texto     Lo que escribió el cliente
 * @returns {Promise<{respuesta: string, avisos: string[]}>}
 */
export async function responder(telefono, texto) {
  const charla = historial(telefono);
  charla.ultimoMensaje = Date.now();
  charla.avisos = [];

  charla.mensajes.push({ rol: 'usuario', texto });
  guardarTurno(telefono, 'cliente', texto);

  let salida = '';

  // Se arma una vez por mensaje: si el catálogo está fresco no cuesta nada, y
  // si toca releer la tienda se hace aquí y no en cada vuelta.
  const instrucciones = await armarInstrucciones();

  // Hasta 5 vueltas: el modelo puede pedir una herramienta y luego seguir escribiendo.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { texto: dicho, llamadas } = await conversar({
      instrucciones,
      herramientas: HERRAMIENTAS,
      historial: charla.mensajes.slice(-MAX_TURNOS),
    });

    if (dicho) salida = dicho;
    charla.mensajes.push({ rol: 'bot', texto: dicho, llamadas });

    if (!llamadas.length) break;

    const resultados = llamadas.map((llamada) => {
      const { resultado, aviso } = ejecutarHerramienta(llamada.nombre, llamada.entrada, telefono);
      if (aviso) charla.avisos.push(aviso);
      return { id: llamada.id, nombre: llamada.nombre, texto: resultado };
    });

    charla.mensajes.push({ rol: 'herramienta', resultados });
  }

  if (!salida) {
    salida = 'Disculpe, no entendí bien. ¿Me puede contar qué necesita?';
  }

  guardarTurno(telefono, 'bot', salida);
  return { respuesta: salida, avisos: charla.avisos };
}

export function olvidarConversacion(telefono) {
  conversaciones.delete(telefono);
}
