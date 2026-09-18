// Servidor del bot. Hace cuatro cosas:
//   1. Recibe los mensajes de WhatsApp (webhook de Meta)
//   2. Los pasa por el cerebro y responde
//   3. Sirve un simulador web en / para probar sin WhatsApp
//   4. Sirve el widget de chat que se pega en fasecol.com

import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { responder } from './cerebro.js';
import { directorioDeRegistros } from './registro.js';
import { proveedorActivo, modeloActivo } from './proveedores.js';
import { enviarTexto, marcarLeido, firmaValida, extraerMensajes } from './whatsapp.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

// Guardamos el cuerpo sin procesar para poder verificar la firma de Meta.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
// --- CORS: permite que fasecol.com llame al bot desde el navegador ---
// Ponga sus dominios en DOMINIOS_PERMITIDOS dentro del .env, separados por coma.
// Ejemplo: DOMINIOS_PERMITIDOS=https://fasecol.com,https://www.fasecol.com
const DOMINIOS_PERMITIDOS = (process.env.DOMINIOS_PERMITIDOS || '')
  .split(',')
  .map((d) => d.trim().replace(/\/$/, ''))
  .filter(Boolean);

function dominioAutorizado(req) {
  const origen = req.get('origin');
  if (!origen) return true; // peticiones sin navegador de por medio

  // El propio sitio donde vive el bot siempre puede llamarse a sí mismo.
  // Sin esto, la página de prueba quedaría bloqueada por su propio servidor.
  try {
    if (new URL(origen).host === req.get('host')) return true;
  } catch (e) {
    return false; // cabecera Origin malformada
  }

  if (!DOMINIOS_PERMITIDOS.length) return true; // sin lista configurada: modo abierto (pruebas)
  return DOMINIOS_PERMITIDOS.includes(origen.replace(/\/$/, ''));
}

app.use((req, res, next) => {
  const origen = req.get('origin');
  if (origen && dominioAutorizado(req)) {
    res.set('Access-Control-Allow-Origin', origen);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(RAIZ, 'public')));

// Evita responder dos veces si Meta reenvía el mismo mensaje.
const yaAtendidos = new Set();

// --- Verificación del webhook (Meta la llama una sola vez, al configurarlo) ---
app.get('/webhook', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto = req.query['hub.challenge'];

  if (modo === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[webhook] Verificado por Meta.');
    return res.status(200).send(reto);
  }
  console.warn('[webhook] Verificación rechazada.');
  return res.sendStatus(403);
});

// --- Mensajes entrantes de WhatsApp ---
app.post('/webhook', async (req, res) => {
  if (!firmaValida(req)) {
    console.warn('[webhook] Firma inválida, mensaje descartado.');
    return res.sendStatus(401);
  }

  // Meta espera un 200 rápido; si nos demoramos, reenvía el mensaje.
  res.sendStatus(200);

  for (const mensaje of extraerMensajes(req.body)) {
    if (yaAtendidos.has(mensaje.id)) continue;
    yaAtendidos.add(mensaje.id);
    if (yaAtendidos.size > 1000) yaAtendidos.clear();

    marcarLeido(mensaje.id);

    try {
      const { respuesta, avisos } = await responder(mensaje.de, mensaje.texto);
      await enviarTexto(mensaje.de, respuesta);

      const asesor = process.env.NUMERO_ASESOR;
      if (asesor && avisos.length) {
        for (const aviso of avisos) {
          await enviarTexto(asesor, `🔔 ${aviso}`).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[bot] Falló la respuesta:', error);
      await enviarTexto(
        mensaje.de,
        'Disculpe, tuvimos un inconveniente técnico. Un asesor le escribe en un momento ' +
          'o puede llamarnos al +57 312 390 2067.'
      ).catch(() => {});
    }
  }
});

// --- Límite de uso ---
// El chat de la página queda expuesto a internet, así que hay que evitar que
// alguien lo use en exceso y le dispare la cuenta de Claude.
const usos = new Map();
const LIMITE_MENSAJES = Number(process.env.LIMITE_MENSAJES_HORA || 40);

function pasaElLimite(clave) {
  const ahora = Date.now();
  const ventana = 60 * 60 * 1000;
  const previos = (usos.get(clave) || []).filter((t) => ahora - t < ventana);
  if (previos.length >= LIMITE_MENSAJES) {
    usos.set(clave, previos);
    return false;
  }
  previos.push(ahora);
  usos.set(clave, previos);
  if (usos.size > 5000) usos.clear();
  return true;
}

// --- Chat web: lo usan el simulador y el widget de la página ---
app.post('/api/chat', async (req, res) => {
  if (!dominioAutorizado(req)) {
    return res.status(403).json({ error: 'Dominio no autorizado.' });
  }

  const { telefono = 'prueba-web', texto } = req.body || {};
  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'Falta el texto del mensaje.' });
  }
  if (texto.length > 1500) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo.' });
  }

  const clave = req.ip || telefono;
  if (!pasaElLimite(clave)) {
    return res.status(429).json({
      error:
        'Ha enviado muchos mensajes seguidos. Escríbanos al WhatsApp +57 312 390 2067 ' +
        'y con gusto lo atendemos.',
    });
  }

  try {
    const { respuesta, avisos } = await responder(telefono, texto.trim());
    res.json({ respuesta, avisos });
  } catch (error) {
    console.error('[chat] Error:', error);
    res.status(500).json({
      error: 'Tuvimos un inconveniente. Por favor intente de nuevo en un momento.',
    });
  }
});

// --- Descargar los registros ---
// En un servidor en la nube usted no puede abrir los archivos del disco, así que
// esta es la forma de bajar la lista de espera. Protegido con una clave que usted
// define en CLAVE_ADMIN. Sin esa variable, la descarga queda desactivada.
app.get('/registros/:archivo', (req, res) => {
  const clave = process.env.CLAVE_ADMIN;
  if (!clave) {
    return res.status(404).send('Descarga desactivada. Defina CLAVE_ADMIN.');
  }
  if (req.query.clave !== clave) {
    return res.status(401).send('Clave incorrecta.');
  }

  const permitidos = {
    'lista-de-espera': 'lista_de_espera.csv',
    'intenciones': 'intenciones_de_compra.csv',
    'casos': 'casos_para_asesor.csv',
    'conversaciones': 'conversaciones.jsonl',
  };
  const nombre = permitidos[req.params.archivo];
  if (!nombre) {
    return res.status(404).send('Archivo no encontrado. Opciones: ' +
      Object.keys(permitidos).join(', '));
  }

  const ruta = path.join(directorioDeRegistros(), nombre);
  if (!fs.existsSync(ruta)) {
    return res.status(404).send('Todavía no hay registros en ' + nombre);
  }
  res.download(ruta, nombre);
});

app.get('/salud', (_req, res) => {
  res.json({
    estado: 'ok',
    cerebro: proveedorActivo(),
    modelo: modeloActivo(),
    hojaDeGoogle: Boolean(process.env.HOJA_WEBHOOK),
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    registros: directorioDeRegistros(),
    registrosPersistentes: Boolean(process.env.REGISTROS_DIR),
    dominiosPermitidos: DOMINIOS_PERMITIDOS.length ? DOMINIOS_PERMITIDOS : 'todos (modo pruebas)',
  });
});

const PUERTO = process.env.PORT || 3000;
// En la nube hay que escuchar en 0.0.0.0, no solo en localhost.
app.listen(PUERTO, '0.0.0.0', () => {
  console.log(`\n  Asistente AZZAO corriendo en el puerto ${PUERTO}`);
  console.log(`  Pagina de prueba: http://localhost:${PUERTO}`);
  console.log(`  Registros en:     ${directorioDeRegistros()}`);

  const proveedor = proveedorActivo();
  if (proveedor === 'ninguno') {
    console.warn(
      '  ⚠ No hay cerebro configurado. El bot no va a poder responder.\n' +
      '    Ponga GEMINI_API_KEY (tiene plan gratuito) o ANTHROPIC_API_KEY.'
    );
  } else {
    console.log(`  Cerebro:          ${proveedor} (${modeloActivo()})`);
  }
  if (!process.env.HOJA_WEBHOOK) {
    console.log('  Hoja de Google:   no configurada (los registros solo van al disco)');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.REGISTROS_DIR) {
    console.warn(
      '\n  ⚠ ATENCION: no hay volumen persistente configurado.\n' +
      '    Los interesados se van a BORRAR en el proximo despliegue.\n' +
      '    Cree un volumen montado en /app/registros y ponga\n' +
      '    REGISTROS_DIR=/app/registros en las variables.\n'
    );
  }
  if (process.env.NODE_ENV === 'production' && !DOMINIOS_PERMITIDOS.length) {
    console.warn(
      '  ⚠ DOMINIOS_PERMITIDOS esta vacio: cualquier pagina de internet\n' +
      '    puede usar este chat y gastar su cuenta de Claude.\n'
    );
  }
  console.log('');
});
