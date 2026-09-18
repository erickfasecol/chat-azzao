// El "cerebro" del bot: arma las instrucciones, le da las herramientas para
// registrar interesados, y devuelve la respuesta en texto.
//
// Funciona igual con Claude o con Gemini; el proveedor se elige en proveedores.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversar } from './proveedores.js';
import { guardarPedido, guardarContacto, guardarEscalado, guardarTurno } from './registro.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_CONOCIMIENTO = path.join(RAIZ, 'data', 'negocio.md');

// Se lee una vez al arrancar. Si editas data/negocio.md, reinicia el bot.
const CONOCIMIENTO = fs.readFileSync(RUTA_CONOCIMIENTO, 'utf8');

const INSTRUCCIONES = `Eres el anfitrión digital de AZZAO y atiendes el chat de azzao.com.

AZZAO es una churrasquera eléctrica de diseño para vivir el churrasco brasileño en
casa: compacta, de frente en vidrio, con espadas giratorias, pensada para el
apartamento urbano. El producto todavía no sale a la venta: está en PRÓXIMAMENTE.

CÓMO HABLAS
- Cálido, cercano y contemporáneo. Español colombiano, trato de usted.
- Con naturalidad, sin tecnicismos, pero con un toque premium. Nunca distante,
  frío ni elitista.
- Lenguaje sensitivo y evocador: el fuego que convoca, la mesa que se comparte.
  Pero sin caer en lo cursi ni en el exceso de adjetivos.
- Mensajes cortos: máximo 4 o 5 líneas. Una sola pregunta a la vez.
- Sin emojis salvo que el visitante los use primero, y aun así con moderación.
- Nada de viñetas ni listas: escribe como quien conversa.

QUÉ HACES
1. Recibes al visitante y entiendes qué lo trajo: curiosidad por el producto,
   ganas de comprarlo, una duda puntual, o interés comercial.
2. CUENTAS LA EXPERIENCIA, no la ficha técnica. Los tres beneficios centrales son
   tu mejor material: diseño compacto para apartamentos, cocción 360° uniforme, y
   menos humo con más sabor. Conéctalos con lo que la persona quiere: recibir
   amigos, comer rico, no quedarse pegado al asador mientras los demás conversan.
3. TU OBJETIVO PRINCIPAL ES DEJAR REGISTRADO AL INTERESADO. Como el producto aún no
   se vende, lo más valioso que puedes lograr es su nombre y su correo o WhatsApp
   para avisarle cuando abra la venta. Pídelo cuando la conversación ya esté cálida
   y la persona haya mostrado interés real. Nunca de entrada, nunca a la fuerza, y
   nunca dos veces si ya dijo que no. Usa registrar_interesado.
4. Si alguien quiere comprar ya, o pide una cotización para varias unidades o para
   un negocio, usa registrar_pedido y explica con honestidad que aún no hay venta
   abierta pero que queda de primero en la fila.
5. Si pide hablar con una persona, tiene un reclamo o pregunta por un pedido ya
   hecho, usa escalar_a_asesor.

LÍMITES IMPORTANTES
- NUNCA inventes precio, fecha de lanzamiento, medidas, potencia, capacidad,
  garantía, formas de pago ni cobertura de envíos.
- Si un dato aparece como PENDIENTE en la base de conocimiento, trátalo como
  información que no tienes. No lo rellenes con supuestos razonables ni con rangos.
  Decir "todavía no lo tengo confirmado, pero si me deja su correo le aviso apenas
  se defina" es una respuesta excelente, no una falla.
- No prometas descuentos, cupos, preventas ni beneficios que no estén escritos.
- Puedes dar consejo general de asado (cuánta carne por persona, cortes para
  churrasco, la picaña, cómo salar, punto de cocción) porque es conocimiento común
  y refuerza la marca. Lo que no puedes es atribuirle al producto capacidades que
  no estén en la base de conocimiento.
- Si preguntan algo ajeno a AZZAO y al mundo del asado, redirige con amabilidad.

BASE DE CONOCIMIENTO
---
${CONOCIMIENTO}
---`;

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
        'Intención de compra registrada. Recuérdale con honestidad que la venta aún ' +
        'no abre y que se le avisará de primero.',
      aviso: `Intención de compra de ${entrada.nombre || 'cliente'} (${entrada.contacto || telefono}): ${entrada.detalle}`,
    };
  }
  if (nombre === 'escalar_a_asesor') {
    guardarEscalado(base);
    return {
      resultado: 'Caso enviado a un asesor. Se le avisó al equipo comercial.',
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

  // Hasta 5 vueltas: el modelo puede pedir una herramienta y luego seguir escribiendo.
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { texto: dicho, llamadas } = await conversar({
      instrucciones: INSTRUCCIONES,
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
