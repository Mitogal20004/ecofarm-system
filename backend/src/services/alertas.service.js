import { supabaseAdmin } from '../lib/supabase.js'
import { enviarCorreo } from './correo.service.js'

const destinatariosConfigurados = (process.env.ALERT_RECIPIENTS || '')
  .split(',')
  .map((correo) => correo.trim().toLowerCase())
  .filter(Boolean)

const deduplicacionMs = Number(process.env.ALERT_DEDUPE_MS || 60 * 60 * 1000)
const persistenciaHabilitada = process.env.ALERT_PERSIST_ENABLED === 'true'
const alertasRecientes = new Map()

async function obtenerDestinatarios() {
  const { data, error } = await supabaseAdmin.rpc(
    'listar_destinatarios_alertas_roles',
  )

  if (error) {
    console.error('No fue posible consultar destinatarios de alertas por rol.', {
      codigo: error.code ?? null,
    })
    return destinatariosConfigurados
  }

  const destinatarios = (Array.isArray(data) ? data : [])
    .map((registro) => registro?.email?.trim().toLowerCase())
    .filter(Boolean)

  return destinatarios.length > 0 ? destinatarios : destinatariosConfigurados
}

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

  const destinatarios = await obtenerDestinatarios()

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

export function emitirAlertasStockBajoSinBloquear() {
  return emitirAlertasStockBajo().catch((error) => {
    console.error('Falló la detección de alertas de stock bajo.', {
      nombre: error?.name,
      mensaje: error?.message,
    })
    return { enviadas: false, error: true }
  })
}

async function emitirAlertasStockBajo() {
  const [{ data: existencias, error: errorExistencias }, { data: insumos, error: errorInsumos }] = await Promise.all([
    supabaseAdmin
      .from('inventario_existencias')
      .select('variante_id, stock_manojos, stock_minimo_manojos'),
    supabaseAdmin
      .from('insumos')
      .select('id, codigo, nombre, stock_actual, stock_minimo, activo')
      .eq('activo', true),
  ])

  if (errorExistencias) throw errorExistencias
  if (errorInsumos) throw errorInsumos

  const alertas = [
    ...(existencias ?? [])
      .filter((existencia) => Number(existencia.stock_manojos) <= Number(existencia.stock_minimo_manojos))
      .map((existencia) => ({
        tipo: 'inventario.stock_bajo',
        severidad: Number(existencia.stock_manojos) === 0 ? 'critical' : 'warning',
        titulo: Number(existencia.stock_manojos) === 0 ? 'Producto sin stock' : 'Stock por debajo del mínimo',
        mensaje: 'Una variante de flores alcanzó o quedó por debajo del stock mínimo configurado.',
        contexto: {
          variante_id: existencia.variante_id,
          stock_manojos: existencia.stock_manojos,
          stock_minimo_manojos: existencia.stock_minimo_manojos,
        },
        claveDeduplicacion: `inventario.stock_bajo:${existencia.variante_id}`,
      })),
    ...(insumos ?? [])
      .filter((insumo) => Number(insumo.stock_actual) <= Number(insumo.stock_minimo))
      .map((insumo) => ({
        tipo: 'insumo.stock_bajo',
        severidad: Number(insumo.stock_actual) === 0 ? 'critical' : 'warning',
        titulo: Number(insumo.stock_actual) === 0 ? 'Insumo agotado' : 'Insumo por debajo del mínimo',
        mensaje: `El insumo ${insumo.codigo} - ${insumo.nombre} alcanzó o quedó por debajo del stock mínimo configurado.`,
        contexto: {
          insumo_id: insumo.id,
          codigo: insumo.codigo,
          nombre: insumo.nombre,
          stock_actual: insumo.stock_actual,
          stock_minimo: insumo.stock_minimo,
        },
        claveDeduplicacion: `insumo.stock_bajo:${insumo.id}`,
      })),
  ]

  for (const alerta of alertas) {
    await emitirAlerta(alerta)
  }

  return { enviadas: alertas.length }
}
