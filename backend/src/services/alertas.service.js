import { supabaseAdmin } from '../lib/supabase.js'
import { enviarCorreo } from './correo.service.js'

const destinatarios = (process.env.ALERT_RECIPIENTS || '')
  .split(',')
  .map((correo) => correo.trim().toLowerCase())
  .filter(Boolean)

const deduplicacionMs = Number(process.env.ALERT_DEDUPE_MS || 60 * 60 * 1000)
const persistenciaHabilitada = process.env.ALERT_PERSIST_ENABLED === 'true'
const alertasRecientes = new Map()

const escaparHtml = (valor) =>
  String(valor).replace(
    /[&<>"']/g,
    (caracter) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[caracter],
  )

const normalizarContexto = (contexto) => {
  if (!contexto || typeof contexto !== 'object' || Array.isArray(contexto)) {
    return {}
  }

  return contexto
}

function alertaDuplicada(clave) {
  if (!clave) return false

  const ahora = Date.now()
  const anterior = alertasRecientes.get(clave)
  if (anterior && ahora - anterior < deduplicacionMs) return true

  alertasRecientes.set(clave, ahora)
  if (alertasRecientes.size > 5000) {
    alertasRecientes.delete(alertasRecientes.keys().next().value)
  }

  return false
}

async function persistirAlerta(alerta) {
  const { error } = await supabaseAdmin.from('alertas').insert({
    tipo: alerta.tipo,
    severidad: alerta.severidad,
    titulo: alerta.titulo,
    mensaje: alerta.mensaje,
    contexto: alerta.contexto,
    clave_deduplicacion: alerta.claveDeduplicacion || null,
  })

  if (error) throw error
}

export async function emitirAlerta({
  tipo,
  severidad = 'warning',
  titulo,
  mensaje,
  contexto = {},
  claveDeduplicacion = null,
}) {
  if (alertaDuplicada(claveDeduplicacion)) {
    return { omitida: 'duplicada' }
  }

  const alerta = {
    tipo,
    severidad,
    titulo,
    mensaje,
    contexto: normalizarContexto(contexto),
    claveDeduplicacion,
  }

  if (persistenciaHabilitada) {
    try {
      await persistirAlerta(alerta)
    } catch (error) {
      console.error('No fue posible persistir una alerta.', {
        tipo,
        codigo: error?.code ?? null,
      })
    }
  }

  if (destinatarios.length === 0) {
    return { enviada: false, omitida: 'no hay destinatarios configurados' }
  }

  const contextoTexto = Object.entries(alerta.contexto)
    .map(([clave, valor]) => `${clave}: ${String(valor)}`)
    .join('\n')

  const asunto = `[${severidad.toUpperCase()}] ${titulo}`
  const texto = `${mensaje}\n\n${contextoTexto}`.trim()
  const html = `<main style="font-family:Arial,sans-serif;line-height:1.5">
    <p><strong>Severidad:</strong> ${escaparHtml(severidad)}</p>
    <h1>${escaparHtml(titulo)}</h1>
    <p>${escaparHtml(mensaje)}</p>
    <pre style="background:#f4f4f4;padding:12px;white-space:pre-wrap">${escaparHtml(contextoTexto)}</pre>
  </main>`

  return enviarCorreo({
    destinatarios,
    asunto,
    html,
    texto,
    tags: [{ name: 'tipo_alerta', value: tipo }],
  })
}

export function emitirAlertaSinBloquear(datos) {
  return emitirAlerta(datos).catch((error) => {
    console.error('Falló el procesamiento de una alerta.', {
      tipo: datos?.tipo ?? null,
      nombre: error?.name,
    })
    return { enviada: false, error: true }
  })
}
