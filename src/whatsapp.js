// Todo lo que tiene que ver con hablarle a WhatsApp Cloud API.

import crypto from 'node:crypto';

const VERSION = 'v21.0';

function configurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Envía un mensaje de texto a un número de WhatsApp. */
export async function enviarTexto(destino, texto) {
  if (!configurado()) {
    console.warn('[whatsapp] Sin credenciales; no se envió nada. Destino:', destino);
    return { simulado: true };
  }

  const url = `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: destino,
      type: 'text',
      text: { body: texto.slice(0, 4000), preview_url: false },
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    console.error('[whatsapp] Error al enviar:', respuesta.status, detalle);
    throw new Error(`WhatsApp respondió ${respuesta.status}`);
  }
  return respuesta.json();
}

/** Marca el mensaje del cliente como leído (los dos chulos azules). */
export async function marcarLeido(idMensaje) {
  if (!configurado()) return;
  const url = `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: idMensaje,
    }),
  }).catch((e) => console.warn('[whatsapp] No se pudo marcar como leído:', e.message));
}

/**
 * Comprueba que el webhook venga de verdad de Meta, usando el App Secret.
 * Si no configuraste WHATSAPP_APP_SECRET, deja pasar todo (útil para pruebas).
 */
export function firmaValida(req) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return true;

  const firma = req.get('x-hub-signature-256');
  if (!firma || !req.rawBody) return false;

  const esperada =
    'sha256=' + crypto.createHmac('sha256', secreto).update(req.rawBody).digest('hex');

  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Saca los mensajes de texto entrantes del cuerpo del webhook.
 * Devuelve [] si lo que llegó es un acuse de recibo o algo que no interesa.
 */
export function extraerMensajes(cuerpo) {
  const salida = [];
  for (const entrada of cuerpo?.entry || []) {
    for (const cambio of entrada?.changes || []) {
      const valor = cambio?.value;
      for (const mensaje of valor?.messages || []) {
        const perfil = valor?.contacts?.[0]?.profile?.name;
        if (mensaje.type === 'text') {
          salida.push({
            id: mensaje.id,
            de: mensaje.from,
            nombrePerfil: perfil,
            texto: mensaje.text.body,
            tipo: 'texto',
          });
        } else {
          // Fotos, audios, documentos: el bot avisa que lo verá un asesor.
          salida.push({
            id: mensaje.id,
            de: mensaje.from,
            nombrePerfil: perfil,
            texto: `[el cliente envió un archivo de tipo ${mensaje.type}]`,
            tipo: mensaje.type,
          });
        }
      }
    }
  }
  return salida;
}
