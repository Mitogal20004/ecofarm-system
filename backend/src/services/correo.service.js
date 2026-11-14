import { Resend } from 'resend'

const habilitado = process.env.EMAIL_ALERTS_ENABLED === 'true'
const apiKey = process.env.RESEND_API_KEY
const correoOrigen = process.env.RESEND_FROM_EMAIL
const nombreOrigen = process.env.RESEND_FROM_NAME || 'E-farm'

if (habilitado && (!apiKey || !correoOrigen)) {
  throw new Error(
    'EMAIL_ALERTS_ENABLED requiere RESEND_API_KEY y RESEND_FROM_EMAIL.',
  )
}

const resend = habilitado ? new Resend(apiKey) : null

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
      tags,
    })

    if (error) {
      throw new ErrorServicioCorreo(
        'Resend no pudo enviar el correo.',
        error,
      )
    }

    return { enviado: true, id: data?.id ?? null }
  } catch (error) {
    if (error instanceof ErrorServicioCorreo) throw error
    throw new ErrorServicioCorreo('No fue posible enviar el correo.', error)
  }
}
