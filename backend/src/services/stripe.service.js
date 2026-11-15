import Stripe from 'stripe'

const crearErrorPago = (mensaje, causa) => {
  const error = new Error(mensaje, { cause })
  error.nombrePublico = mensaje
  return error
}

const crearErrorPagoNoConfirmado = (mensaje) => {
  const error = crearErrorPago(mensaje)
  error.codigo = '23514'
  return error
}

const obtenerStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe] STRIPE_SECRET_KEY no está configurada.')
    throw crearErrorPago('Stripe no está configurado en el servidor.')
  }

  console.info('[stripe] Cliente inicializado.', {
    modo: process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test',
  })
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

const obtenerTasa = () => {
  const tasa = Number(process.env.STRIPE_GTQ_USD_RATE)
  if (!Number.isFinite(tasa) || tasa <= 0) {
    console.error('[stripe] STRIPE_GTQ_USD_RATE no está configurada correctamente.')
    throw crearErrorPago('La tasa de conversión GTQ a USD no está configurada.')
  }
  return tasa
}

export const convertirGtqAUsdCentavos = (montoGtq) => {
  const tasa = obtenerTasa()
  const montoUsd = Number(montoGtq) * tasa
  const centavos = Math.round(montoUsd * 100)

  if (!Number.isSafeInteger(centavos) || centavos < 50) {
    throw crearErrorPago('El monto convertido no cumple el mínimo de Stripe.')
  }

  return { centavos, tasa, montoUsd: centavos / 100 }
}

export async function crearPaymentIntent({ montoGtq, claveIdempotencia }) {
  const stripe = obtenerStripe()
  const { centavos, tasa, montoUsd } = convertirGtqAUsdCentavos(montoGtq)

  console.info('[stripe] Creando PaymentIntent.', {
    montoGtq: Number(montoGtq).toFixed(2),
    montoUsd: montoUsd.toFixed(2),
    centavos,
    tasa,
    idempotencia: claveIdempotencia.slice(0, 8),
  })

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: centavos,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          monto_gtq: Number(montoGtq).toFixed(2),
          tasa_gtq_usd: String(tasa),
        },
      },
      { idempotencyKey: claveIdempotencia },
    )

    console.info('[stripe] PaymentIntent creado.', {
      paymentIntentId: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
    })

    return {
      payment_intent_id: intent.id,
      client_secret: intent.client_secret,
      monto_gtq: Number(montoGtq).toFixed(2),
      monto_usd: montoUsd.toFixed(2),
      tasa_gtq_usd: tasa,
    }
  } catch (error) {
    console.error('[stripe] Error al crear PaymentIntent.', {
      tipo: error?.type,
      codigo: error?.code,
      mensaje: error?.message,
      statusCode: error?.statusCode,
      requestId: error?.requestId,
    })
    throw crearErrorPago('No fue posible preparar el pago con tarjeta.', error)
  }
}

export async function obtenerPaymentIntent(paymentIntentId) {
  const stripe = obtenerStripe()
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (error) {
    throw crearErrorPago('No fue posible verificar el pago con tarjeta.', error)
  }
}

export async function verificarPaymentIntent({ paymentIntentId, montoGtq }) {
  const intent = await obtenerPaymentIntent(paymentIntentId)
  const { centavos } = convertirGtqAUsdCentavos(montoGtq)

  if (
    intent.status !== 'succeeded' ||
    intent.currency !== 'usd' ||
    intent.amount !== centavos
  ) {
    throw crearErrorPagoNoConfirmado(
      'El pago con tarjeta no coincide con el monto de la venta.',
    )
  }

  return intent
}
