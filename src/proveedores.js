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

  const respuesta = await cliente.models.generateContent({
    model: modelo || 'gemini-2.5-flash',
    contents: historialParaGemini(historial),
    config: {
      systemInstruction: instrucciones,
      maxOutputTokens: 1024,
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
  });

  const partes = respuesta?.candidates?.[0]?.content?.parts || [];

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
  if (p === 'gemini') return process.env.GEMINI_MODELO || 'gemini-2.5-flash';
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
}

export async function conversar(opciones) {
  const proveedor = proveedorActivo();
  const conModelo = { ...opciones, modelo: modeloActivo() };

  if (proveedor === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Falta GEMINI_API_KEY en las variables de entorno.');
    }
    return conversarConGemini(conModelo);
  }
  if (proveedor === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Falta ANTHROPIC_API_KEY en las variables de entorno.');
    }
    return conversarConClaude(conModelo);
  }
  throw new Error(
    'No hay ningún proveedor configurado. Ponga GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY.'
  );
}

// Exportados solo para las pruebas.
export const _internos = { esquemaParaGemini, historialParaGemini, historialParaClaude };
