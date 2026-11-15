import { Resend } from 'resend'

const habilitado = process.env.EMAIL_ALERTS_ENABLED === 'true'
const apiKey = process.env.RESEND_API_KEY
const correoOrigen = process.env.RESEND_FROM_EMAIL
const nombreOrigen = process.env.RESEND_FROM_NAME || 'E-farm'

const normalizarTag = (valor) =>
  String(valor ?? '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 256)

if (habilitado && (!apiKey || !correoOrigen)) {
  throw new Error(
    'EMAIL_ALERTS_ENABLED requiere RESEND_API_KEY y RESEND_FROM_EMAIL.',
  )
}

const resend = habilitado ? new Resend(apiKey) : null

console.info('[correo] Servicio de correo inicializado.', {
  habilitado,
  origenConfigurado: Boolean(correoOrigen),
})

export class ErrorServicioCorreo extends Error {
  constructor(mensaje, causa) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorServicioCorreo'
  }
}

export function correoEstaHabilitado() {
  return habilitado
}

export async function enviarCorreo({ destinatarios, asunto, html, texto, tags }) {
  if (!habilitado) {
    console.warn('[correo] Envío omitido: EMAIL_ALERTS_ENABLED no está activo.')
    return { enviado: false, omitido: 'EMAIL_ALERTS_ENABLED no está activo' }
  }

  if (
    !Array.isArray(destinatarios) ||
    destinatarios.length === 0 ||
    typeof asunto !== 'string' ||
    typeof html !== 'string' ||
    typeof texto !== 'string'
  ) {
    throw new ErrorServicioCorreo('Los datos del correo no son válidos.')
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${nombreOrigen} <${correoOrigen}>`,
      to: destinatarios,
      subject: asunto,
      html,
      text: texto,
      tags: Array.isArray(tags)
        ? tags.map((tag) => ({
            name: normalizarTag(tag?.name),
            value: normalizarTag(tag?.value),
          }))
        : tags,
    })

    if (error) {
      console.error('[correo] Resend rechazó el envío.', {
        codigo: error.code ?? null,
        nombre: error.name ?? null,
        mensaje: error.message ?? null,
        cantidadDestinatarios: destinatarios.length,
      })
      throw new ErrorServicioCorreo(
        'Resend no pudo enviar el correo.',
        error,
      )
    }

    console.info('[correo] Correo aceptado por Resend.', {
      id: data?.id ?? null,
      cantidadDestinatarios: destinatarios.length,
    })
    return { enviado: true, id: data?.id ?? null }
  } catch (error) {
    if (error instanceof ErrorServicioCorreo) throw error
    console.error('[correo] Error inesperado al enviar correo.', {
      nombre: error?.name ?? null,
      mensaje: error?.message ?? null,
    })
    throw new ErrorServicioCorreo('No fue posible enviar el correo.', error)
  }
}
