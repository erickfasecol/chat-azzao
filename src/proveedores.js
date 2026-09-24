// Capa de proveedores: el bot puede pensar con Claude (de pago, mejor calidad)
// o con Gemini (tiene plan gratuito). Se elige con la variable PROVEEDOR.
//
// Hacia afuera los dos se comportan igual, así que el resto del código no
// necesita saber cuál está en uso.
//
// Formato neutro del historial, para no atarlo a ningún proveedor:
//   { rol: 'usuario',    texto }
//   { rol: 'bot',        texto, llamadas: [{ id, nombre, entrada }] }
//   { rol: 'herramienta', resultados: [{ id, nombre, texto }] }
//
// Y toda respuesta se devuelve como: { texto, llamadas: [{ id, nombre, entrada }] }

/* -------------------------------------------------------------------------
 * Claude
 * ---------------------------------------------------------------------- */

function historialParaClaude(historial) {
  return historial.map((turno) => {
    if (turno.rol === 'usuario') {
      return { role: 'user', content: turno.texto };
    }
    if (turno.rol === 'bot') {
      const bloques = [];
      if (turno.texto) bloques.push({ type: 'text', text: turno.texto });
      for (const ll of turno.llamadas || []) {
        bloques.push({ type: 'tool_use', id: ll.id, name: ll.nombre, input: ll.entrada });
      }
      return { role: 'assistant', content: bloques };
    }
    return {
      role: 'user',
      content: (turno.resultados || []).map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: r.texto,
      })),
    };
  });
}

async function conversarConClaude({ instrucciones, herramientas, historial, modelo }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const respuesta = await cliente.messages.create({
    model: modelo || 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: instrucciones,
    tools: herramientas.map((h) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: h.esquema,
    })),
    messages: historialParaClaude(historial),
  });

  const texto = respuesta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const llamadas = respuesta.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, nombre: b.name, entrada: b.input }));

  return { texto, llamadas };
}

/* -------------------------------------------------------------------------
 * Gemini
 * ---------------------------------------------------------------------- */

// Gemini espera los tipos en mayúscula (OBJECT, STRING...), no como JSON Schema.
function esquemaParaGemini(esquema) {
  if (!esquema || typeof esquema !== 'object') return esquema;

  const convertido = {};
  for (const [clave, valor] of Object.entries(esquema)) {
    if (clave === 'type' && typeof valor === 'string') {
      convertido.type = valor.toUpperCase();
    } else if (clave === 'properties' && valor && typeof valor === 'object') {
      convertido.properties = Object.fromEntries(
        Object.entries(valor).map(([k, v]) => [k, esquemaParaGemini(v)])
      );
    } else if (clave === 'items') {
      convertido.items = esquemaParaGemini(valor);
    } else {
      convertido[clave] = valor;
    }
  }
  return convertido;
}

function historialParaGemini(historial) {
  return historial.map((turno) => {
    if (turno.rol === 'usuario') {
      return { role: 'user', parts: [{ text: turno.texto }] };
    }
    if (turno.rol === 'bot') {
      const partes = [];
      if (turno.texto) partes.push({ text: turno.texto });
      for (const ll of turno.llamadas || []) {
        partes.push({ functionCall: { name: ll.nombre, args: ll.entrada } });
      }
      // Gemini no acepta turnos vacíos.
      if (!partes.length) partes.push({ text: ' ' });
      return { role: 'model', parts: partes };
    }
    return {
      role: 'user',
      parts: (turno.resultados || []).map((r) => ({
        functionResponse: { name: r.nombre, response: { resultado: r.texto } },
      })),
    };
  });
}

async function conversarConGemini({ instrucciones, herramientas, historial, modelo }) {
  const { GoogleGenAI } = await import('@google/genai');
  const cliente = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    ...(process.env.GEMINI_BASE_URL
      ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } }
      : {}),
  });

  // Los modelos Gemini 3 "piensan" antes de responder, y ese pensamiento
  // consume del mismo presupuesto de salida. Con un límite corto, el modelo
  // gasta todo pensando y devuelve una respuesta vacía. Por eso el margen
  // amplio: es la causa más común de que el chat se quede mudo.
  const TOPE_SALIDA = Number(process.env.GEMINI_MAX_TOKENS || 4096);

  const peticion = {
    model: modelo || 'gemini-3.6-flash',
    contents: historialParaGemini(historial),
    config: {
      systemInstruction: instrucciones,
      maxOutputTokens: TOPE_SALIDA,
      tools: [
        {
          functionDeclarations: herramientas.map((h) => ({
            name: h.nombre,
            description: h.descripcion,
            parameters: esquemaParaGemini(h.esquema),
          })),
        },
      ],
    },
  };

  // Permite recortar el pensamiento si algún día hace falta, sin tocar código.
  if (process.env.GEMINI_PENSAMIENTO) {
    peticion.config.thinkingConfig = {
      thinkingBudget: Number(process.env.GEMINI_PENSAMIENTO),
    };
  }

  const respuesta = await cliente.models.generateContent(peticion);

  const candidato = respuesta?.candidates?.[0];
  const partes = candidato?.content?.parts || [];

  // Deja rastro de por qué terminó, que es lo que permite diagnosticar
  // respuestas vacías sin adivinar.
  if (!partes.length) {
    console.warn(
      '[gemini] Respuesta sin contenido.',
      'motivo:', candidato?.finishReason,
      'uso:', JSON.stringify(respuesta?.usageMetadata || {})
    );
  }

  const texto = partes
    .filter((p) => typeof p.text === 'string' && p.text.trim())
    .map((p) => p.text)
    .join('\n')
    .trim();

  // Gemini no asigna identificadores a las llamadas; los inventamos nosotros
  // para poder emparejar cada resultado con su llamada.
  const llamadas = partes
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `g_${Date.now()}_${i}`,
      nombre: p.functionCall.name,
      entrada: p.functionCall.args || {},
    }));

  return { texto, llamadas };
}

/* -------------------------------------------------------------------------
 * Selector
 * ---------------------------------------------------------------------- */

export function proveedorActivo() {
  const elegido = (process.env.PROVEEDOR || '').toLowerCase();
  if (elegido === 'gemini') return 'gemini';
  if (elegido === 'claude') return 'claude';
  // Sin elegir: usa el que tenga llave configurada, prefiriendo Claude.
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'ninguno';
}

export function modeloActivo() {
  const p = proveedorActivo();
  // Ojo: gemini-2.5-flash ya no está disponible para cuentas nuevas.
  if (p === 'gemini') return process.env.GEMINI_MODELO || 'gemini-3.6-flash';
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
}

/* -------------------------------------------------------------------------
 * Reintentos
 *
 * Los modelos gratuitos se saturan. Google contesta 503 "high demand" y la
 * petición se cae, aunque un segundo después funcione perfecto. Sin esto, esa
 * saturación pasajera le aparece al visitante como un error del chat.
 *
 * Solo se reintenta lo pasajero. Una llave mala o un modelo que no existe
 * fallan de una, porque reintentar no los va a arreglar.
 * ---------------------------------------------------------------------- */

const REINTENTOS = Math.max(1, Number(process.env.REINTENTOS_MODELO || 3));

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

function esPasajero(error) {
  const codigo = Number(
    error?.status ?? error?.code ?? error?.error?.code ?? error?.response?.status
  );
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(codigo)) return true;

  const texto = String(error?.message || error || '').toLowerCase();
  return (
    texto.includes('unavailable') ||
    texto.includes('overloaded') ||
    texto.includes('high demand') ||
    texto.includes('try again') ||
    texto.includes('resource_exhausted') ||
    texto.includes('rate limit') ||
    texto.includes('deadline') ||
    texto.includes('timeout') ||
    texto.includes('econnreset') ||
    texto.includes('fetch failed') ||
    texto.includes('503') ||
    texto.includes('529')
  );
}

async function conIntentos(tarea, etiqueta) {
  let ultimoError;

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      return await tarea();
    } catch (error) {
      ultimoError = error;
      if (!esPasajero(error) || intento === REINTENTOS) break;

      // Espera creciente con un pellizco de azar, para no reintentar todos
      // los visitantes en el mismo instante.
      const espera = Math.round(700 * Math.pow(2, intento - 1) + Math.random() * 300);
      console.warn(
        `[${etiqueta}] Intento ${intento} de ${REINTENTOS} falló ` +
        `(${error?.message || error}). Reintento en ${espera} ms.`
      );
      await dormir(espera);
    }
  }

  throw ultimoError;
}

export async function conversar(opciones) {
  const proveedor = proveedorActivo();
  const conModelo = { ...opciones, modelo: modeloActivo() };

  if (proveedor === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Falta GEMINI_API_KEY en las variables de entorno.');
    }

    try {
      return await conIntentos(() => conversarConGemini(conModelo), 'gemini');
    } catch (error) {
      // Último recurso: si el modelo de siempre sigue saturado y hay un modelo
      // de respaldo configurado, se intenta con ese antes de darse por vencido.
      const respaldo = process.env.GEMINI_MODELO_RESPALDO;
      if (respaldo && respaldo !== conModelo.modelo && esPasajero(error)) {
        console.warn(`[gemini] ${conModelo.modelo} saturado. Probando con ${respaldo}.`);
        return conIntentos(
          () => conversarConGemini({ ...conModelo, modelo: respaldo }),
          'gemini-respaldo'
        );
      }
      throw error;
    }
  }

  if (proveedor === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Falta ANTHROPIC_API_KEY en las variables de entorno.');
    }
    return conIntentos(() => conversarConClaude(conModelo), 'claude');
  }
  throw new Error(
    'No hay ningún proveedor configurado. Ponga GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY.'
  );
}

// Exportados solo para las pruebas.
export const _internos = {
  esquemaParaGemini,
  historialParaGemini,
  historialParaClaude,
  esPasajero,
  conIntentos,
};
