// Guarda interesados, intenciones de compra y conversaciones en archivos simples.
// No necesita base de datos: todo queda como archivos de texto abribles en Excel.
//
// IMPORTANTE para servidores en la nube: estos archivos van en una carpeta
// SEPARADA de `data/`, porque en Railway (y en casi todo hosting moderno) el
// disco se borra en cada despliegue. Esa carpeta debe apuntar a un volumen
// persistente mediante la variable REGISTROS_DIR. Si no, cada actualización
// del bot se llevaría por delante la lista de espera.
//
// En Railway: cree un volumen montado en /app/registros y no toque nada más,
// porque ese es justamente el valor por defecto dentro del contenedor.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_DATOS = process.env.REGISTROS_DIR || path.join(RAIZ, 'registros');

fs.mkdirSync(DIR_DATOS, { recursive: true });

const ARCHIVOS = {
  pedidos: path.join(DIR_DATOS, 'intenciones_de_compra.csv'),
  contactos: path.join(DIR_DATOS, 'lista_de_espera.csv'),
  escalados: path.join(DIR_DATOS, 'casos_para_asesor.csv'),
  conversaciones: path.join(DIR_DATOS, 'conversaciones.jsonl'),
};

const ENCABEZADOS = {
  pedidos: [
    'fecha', 'nombre', 'contacto', 'ciudad', 'tipo', 'cantidad', 'detalle', 'notas', 'sesion',
  ],
  contactos: [
    'fecha', 'nombre', 'correo', 'whatsapp', 'ciudad', 'interes', 'notas', 'sesion',
  ],
  escalados: ['fecha', 'nombre', 'motivo', 'resumen', 'sesion'],
};

function campoCsv(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor);
  return `"${texto.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function agregarFila(tipo, fila) {
  const archivo = ARCHIVOS[tipo];
  const columnas = ENCABEZADOS[tipo];
  if (!fs.existsSync(archivo)) {
    // BOM para que Excel en español abra bien las tildes.
    fs.writeFileSync(archivo, '﻿' + columnas.join(',') + '\n', 'utf8');
  }
  const linea = columnas.map((c) => campoCsv(fila[c])).join(',') + '\n';
  fs.appendFileSync(archivo, linea, 'utf8');
}

const ahora = () =>
  new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });

/**
 * Además del archivo, manda cada registro a una hoja de Google (u otro destino).
 *
 * Esto es lo que salva los datos cuando el bot corre en un hosting gratuito,
 * donde el disco se borra solo. Se activa poniendo HOJA_WEBHOOK en las
 * variables; si está vacía, simplemente no hace nada.
 *
 * Nunca interrumpe la conversación: si el envío falla, lo anota en el log y
 * sigue, porque el archivo local ya guardó el dato.
 */
async function enviarAlWebhook(tipo, fila) {
  const url = process.env.HOJA_WEBHOOK;
  if (!url) return;

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, ...fila }),
      signal: AbortSignal.timeout(8000),
    });
    if (!respuesta.ok) {
      console.warn('[hoja] Respondió', respuesta.status, 'al guardar un', tipo);
    }
  } catch (error) {
    console.warn('[hoja] No se pudo enviar el', tipo, '—', error.message);
  }
}

function registrar(tipo, datos) {
  const fila = { fecha: ahora(), ...datos };
  agregarFila(tipo, fila);
  // Sin await: que el visitante no espere por esto.
  enviarAlWebhook(tipo, fila);
}

export function guardarPedido(datos) {
  registrar('pedidos', datos);
}

export function guardarContacto(datos) {
  registrar('contactos', datos);
}

export function guardarEscalado(datos) {
  registrar('escalados', datos);
}

export function guardarTurno(telefono, rol, texto) {
  const registro = { fecha: new Date().toISOString(), telefono, rol, texto };
  fs.appendFileSync(ARCHIVOS.conversaciones, JSON.stringify(registro) + '\n', 'utf8');
}

export const rutasDeArchivos = ARCHIVOS;
export const directorioDeRegistros = () => DIR_DATOS;
