// Lee los productos directamente de la tienda, para que el bot esté siempre al
// día sin que nadie tenga que editar nada.
//
// Usa la API pública de WooCommerce (Store API), que no pide llaves ni
// contraseñas: es la misma información que cualquiera ve en la tienda.
//
//   https://azzao.com/wp-json/wc/store/v1/products
//
// Dos reglas de oro:
//
//  1. ESTO NUNCA DEBE DEMORAR UNA RESPUESTA DEL CHAT. La lectura de la tienda
//     pasa por detrás. El chat usa lo que haya en memoria y sigue de largo.
//  2. ESTO NUNCA DEBE TUMBAR EL BOT. Si la tienda falla, se usa la última copia
//     buena; y si nunca hubo una, el bot cae al catálogo de data/negocio.md.

const TIENDA = (process.env.TIENDA_URL || 'https://azzao.com').replace(/\/$/, '');
const MINUTOS = Number(process.env.CATALOGO_MINUTOS || 15);
const VENCE_EN_MS = Math.max(1, MINUTOS) * 60 * 1000;

// Si la tienda falla no insistimos a cada rato: esperamos antes de reintentar.
const REINTENTO_MS = 5 * 60 * 1000;

// Algunos hostings y plugins de seguridad de WordPress bloquean las peticiones
// que no parecen venir de un navegador y devuelven una página HTML de bloqueo
// en vez de la lista de productos. Por eso nos presentamos como un navegador.
const NAVEGADOR =
  process.env.CATALOGO_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let memoria = {
  texto: null,
  cuando: 0,
  productos: 0,
  error: null,
  pista: null,
  proximoIntento: 0,
};

let enCurso = null;

/** Quita etiquetas HTML y deja texto corrido legible. */
function sinHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '. ')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s*\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La API entrega los precios en la unidad más pequeña de la moneda.
 * En pesos colombianos suele venir sin decimales, pero no lo damos por hecho.
 */
function formatearPrecio(precios) {
  if (!precios || precios.price === undefined || precios.price === null) return null;

  const decimales = Number(precios.currency_minor_unit ?? 0);
  const valor = Number(precios.price) / Math.pow(10, decimales);
  if (!Number.isFinite(valor)) return null;

  const separado = valor.toLocaleString('es-CO', {
    minimumFractionDigits: decimales > 0 ? 2 : 0,
    maximumFractionDigits: decimales > 0 ? 2 : 0,
  });
  return (precios.currency_symbol || '$') + separado;
}

/** Convierte la respuesta de la tienda en texto que el modelo pueda leer. */
function armarTexto(productos) {
  const porCategoria = new Map();

  for (const p of productos) {
    const categorias = (p.categories || []).map((c) => c.name);
    const clave = categorias[0] || 'Sin categoría';
    if (!porCategoria.has(clave)) porCategoria.set(clave, []);
    porCategoria.get(clave).push(p);
  }

  const lineas = [];

  for (const [categoria, lista] of porCategoria) {
    lineas.push(`### ${categoria}`);
    lineas.push('');

    for (const p of lista) {
      const precio = formatearPrecio(p.prices);
      lineas.push(`**${p.name}** — ${precio || 'precio no publicado'}`);

      const datos = [];
      if (p.sku) datos.push(`SKU ${p.sku}`);
      if (p.is_in_stock === false) {
        datos.push('AGOTADO');
      } else if (p.low_stock_remaining) {
        datos.push(`quedan ${p.low_stock_remaining}`);
      }
      if (datos.length) lineas.push(datos.join(' · '));

      const corta = sinHtml(p.short_description);
      const larga = sinHtml(p.description);
      const descripcion = corta || larga;

      if (descripcion) {
        lineas.push(descripcion.slice(0, 900));
        // Si la corta y la larga dicen cosas distintas, vale la pena ambas.
        if (corta && larga && !larga.startsWith(corta.slice(0, 40))) {
          lineas.push(larga.slice(0, 900));
        }
      } else {
        lineas.push(
          'Sin descripción publicada. Si preguntan detalles de este producto, ' +
          'remitir al WhatsApp.'
        );
      }

      if (p.permalink) lineas.push(`Enlace: ${p.permalink}`);
      lineas.push('');
    }
  }

  return lineas.join('\n').trim();
}

/** Una lectura real de la tienda. Solo la llama refrescarSiHaceFalta(). */
async function leerTienda() {
  const url = `${TIENDA}/wp-json/wc/store/v1/products?per_page=100`;

  try {
    const respuesta = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': NAVEGADOR,
        'Accept-Language': 'es-CO,es;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    const tipo = respuesta.headers.get('content-type') || '';
    const cuerpo = await respuesta.text();

    if (!respuesta.ok) {
      throw Object.assign(new Error(`la tienda respondió ${respuesta.status}`), {
        pista: cuerpo.slice(0, 200),
      });
    }

    // Si llega HTML en vez de JSON, casi siempre es un plugin de seguridad, un
    // modo "próximamente" o el firewall del hosting tapando la petición.
    if (!tipo.includes('json') || cuerpo.trim().startsWith('<')) {
      throw Object.assign(
        new Error(
          'la tienda devolvió una página HTML en vez de la lista de productos ' +
          '(posible plugin de seguridad, modo próximamente o firewall del hosting)'
        ),
        { pista: cuerpo.replace(/\s+/g, ' ').slice(0, 200) }
      );
    }

    const productos = JSON.parse(cuerpo);
    if (!Array.isArray(productos)) throw new Error('la tienda no devolvió una lista');
    if (!productos.length) throw new Error('la tienda no tiene productos publicados');

    memoria = {
      texto: armarTexto(productos),
      cuando: Date.now(),
      productos: productos.length,
      error: null,
      pista: null,
      proximoIntento: Date.now() + VENCE_EN_MS,
    };
    console.log(`[catalogo] Actualizado: ${productos.length} productos.`);

  } catch (error) {
    memoria.error = error?.message || String(error);
    memoria.pista = error?.pista || null;
    memoria.proximoIntento = Date.now() + REINTENTO_MS;

    if (memoria.texto) {
      console.warn(
        `[catalogo] No se pudo actualizar (${memoria.error}). Se sigue usando la última copia.`
      );
    } else {
      console.warn(
        `[catalogo] No se pudo leer la tienda (${memoria.error}). ` +
        'El bot usará el catálogo escrito en data/negocio.md.'
      );
      if (memoria.pista) console.warn(`[catalogo] Respondió: ${memoria.pista}`);
    }
  }

  return memoria.texto;
}

/** Lanza una lectura si toca. Devuelve la promesa en curso, o null. */
function refrescarSiHaceFalta() {
  if (enCurso) return enCurso;
  if (Date.now() < memoria.proximoIntento) return null;
  enCurso = leerTienda().finally(() => { enCurso = null; });
  return enCurso;
}

/**
 * El catálogo que hay ahora mismo, sin esperar a nadie.
 * Si toca refrescar, lo hace por detrás y esa respuesta entra en el mensaje
 * siguiente. Esto es lo que usa el chat.
 */
export function catalogoActual() {
  refrescarSiHaceFalta();
  return memoria.texto;
}

/** Espera la lectura. Solo se usa al arrancar el servidor. */
export async function refrescarCatalogo() {
  const pendiente = refrescarSiHaceFalta();
  if (pendiente) await pendiente;
  return memoria.texto;
}

/** Para /salud y /diagnostico. */
export function estadoDelCatalogo() {
  return {
    tienda: TIENDA,
    productos: memoria.productos,
    ultimaLectura: memoria.cuando ? new Date(memoria.cuando).toISOString() : null,
    minutosDeCache: MINUTOS,
    ultimoError: memoria.error,
    respondio: memoria.pista,
  };
}

// Exportados solo para las pruebas.
export const _internos = { sinHtml, formatearPrecio, armarTexto };
