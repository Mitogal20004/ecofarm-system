import { supabaseAdmin } from '../lib/supabase.js'
import { enviarCorreo } from './correo.service.js'

const destinatariosConfigurados = (process.env.ALERT_RECIPIENTS || '')
  .split(',')
  .map((correo) => correo.trim().toLowerCase())
  .filter(Boolean)

const deduplicacionMs = Number(process.env.ALERT_DEDUPE_MS || 60 * 60 * 1000)
const persistenciaHabilitada = process.env.ALERT_PERSIST_ENABLED === 'true'
const alertasRecientes = new Map()
const urlFrontend = (process.env.FRONTEND_URL || 'https://efarm26.online').split(',')[0].trim().replace(/\/$/, '')
const urlInventario = `${urlFrontend}/?vista=inventario`
const urlLogo = `${urlFrontend}/favicon.svg`

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
    console.warn('[alertas] Alerta omitida: no hay destinatarios configurados.', {
      tipo,
    })
    return { enviada: false, omitida: 'no hay destinatarios configurados' }
  }

  console.info('[alertas] Enviando alerta por correo.', {
    tipo,
    cantidadDestinatarios: destinatarios.length,
  })

  const contextoTexto = Object.entries(alerta.contexto)
    .map(([clave, valor]) => `${clave}: ${String(valor)}`)
    .join('\n')

  const asunto = `[${severidad.toUpperCase()}] ${titulo}`
  const texto = `${mensaje}\n\n${contextoTexto}`.trim()
  const filasContexto = Object.entries(alerta.contexto)
    .map(
      ([clave, valor]) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5ebe6;color:#637168;font-size:13px">${escaparHtml(clave.replaceAll('_', ' '))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5ebe6;color:#17231c;font-size:14px;font-weight:700">${escaparHtml(valor)}</td>
      </tr>`,
    )
    .join('')
  const colorSeveridad = severidad === 'critical' ? '#b42318' : '#a76616'
  const html = `<!doctype html>
  <html lang="es"><body style="margin:0;background:#f3f6f2;font-family:Arial,Helvetica,sans-serif;color:#17231c">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f2;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dce5dd;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px 30px;background:#173d2d">
            <img src="${escaparHtml(urlLogo)}" width="54" height="54" alt="E-farm" style="display:block;margin-bottom:14px">
            <div style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-.4px">E-farm</div>
            <div style="margin-top:4px;color:#cfe3d4;font-size:13px">Gestión agrícola</div>
          </td></tr>
          <tr><td style="padding:30px">
            <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:${colorSeveridad};color:#ffffff;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${escaparHtml(severidad)}</div>
            <h1 style="margin:18px 0 10px;color:#17231c;font-size:28px;line-height:1.2">${escaparHtml(titulo)}</h1>
            <p style="margin:0 0 24px;color:#526158;font-size:16px;line-height:1.6">${escaparHtml(mensaje)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5ebe6;border-radius:10px;overflow:hidden">${filasContexto}</table>
            <div style="padding-top:28px;text-align:center">
              <a href="${escaparHtml(urlInventario)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#1f6a43;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none">Ir al inventario</a>
            </div>
          </td></tr>
          <tr><td style="padding:18px 30px;background:#f7faf7;color:#829087;font-size:12px;line-height:1.5">Alerta automática de inventario. Ingresa al sistema para revisar el stock y tomar acción.</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`

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
      causaCodigo: error?.cause?.code ?? null,
      causaNombre: error?.cause?.name ?? null,
      causaMensaje: error?.cause?.message ?? null,
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
