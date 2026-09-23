// Lee los productos directamente de la tienda, para que el bot esté siempre al
// día sin que nadie tenga que editar nada.
//
// Usa la API pública de WooCommerce (Store API), que no pide llaves ni
// contraseñas: es la misma información que cualquiera ve en la tienda.
//
//   https://azzao.com/wp-json/wc/store/v1/products
//
// Se consulta cada cierto tiempo, no en cada mensaje, para no golpear la
// tienda de más. Si la tienda no responde, se sigue usando la última copia
// buena; y si nunca hubo una, el bot cae al catálogo escrito en negocio.md.

const TIENDA = (process.env.TIENDA_URL || 'https://azzao.com').replace(/\/$/, '');
const MINUTOS = Number(process.env.CATALOGO_MINUTOS || 15);
const VENCE_EN_MS = Math.max(1, MINUTOS) * 60 * 1000;

let memoria = {
  texto: null,
  cuando: 0,
  productos: 0,
  error: null,
};

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

/**
 * Devuelve el catálogo en texto, o null si nunca se pudo leer.
 * No lanza excepciones: si algo falla, el bot debe seguir atendiendo.
 */
export async function obtenerCatalogo() {
  const fresco = memoria.texto && Date.now() - memoria.cuando < VENCE_EN_MS;
  if (fresco) return memoria.texto;

  try {
    const url = `${TIENDA}/wp-json/wc/store/v1/products?per_page=100`;
    const respuesta = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!respuesta.ok) {
      throw new Error(`la tienda respondió ${respuesta.status}`);
    }

    const productos = await respuesta.json();
    if (!Array.isArray(productos)) {
      throw new Error('la tienda no devolvió una lista de productos');
    }
    if (!productos.length) {
      throw new Error('la tienda no tiene productos publicados');
    }

    memoria = {
      texto: armarTexto(productos),
      cuando: Date.now(),
      productos: productos.length,
      error: null,
    };
    console.log(`[catalogo] Actualizado: ${productos.length} productos.`);
    return memoria.texto;

  } catch (error) {
    memoria.error = error.message;
    if (memoria.texto) {
      console.warn(
        '[catalogo] No se pudo actualizar (' + error.message + '). ' +
        'Se sigue usando la última copia.'
      );
      // Damos un respiro antes de reintentar, para no insistir en cada mensaje.
      memoria.cuando = Date.now() - VENCE_EN_MS + 60 * 1000;
      return memoria.texto;
    }
    console.warn(
      '[catalogo] No se pudo leer la tienda (' + error.message + '). ' +
      'El bot usará el catálogo escrito en negocio.md.'
    );
    return null;
  }
}

/** Para /salud y /diagnostico. */
export function estadoDelCatalogo() {
  return {
    tienda: TIENDA,
    productos: memoria.productos,
    ultimaLectura: memoria.cuando ? new Date(memoria.cuando).toISOString() : null,
    minutosDeCache: MINUTOS,
    ultimoError: memoria.error,
  };
}

// Exportados solo para las pruebas.
export const _internos = { sinHtml, formatearPrecio, armarTexto };
