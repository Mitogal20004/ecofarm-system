import { ErrorValidacionFel } from './errores.js'

const PATRON_DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/

const potenciaDiez = (exponente) => 10n ** BigInt(exponente)

export function decimalExacto(valor, campo, escalaMaxima = 12) {
  const texto = typeof valor === 'number' ? String(valor) : valor

  if (
    typeof texto !== 'string' ||
    !PATRON_DECIMAL.test(texto) ||
    !Number.isInteger(escalaMaxima) ||
    escalaMaxima < 0
  ) {
    throw new ErrorValidacionFel(`${campo} no es un decimal válido.`)
  }

  const [, entero, fraccion = ''] = texto.match(PATRON_DECIMAL)

  if (fraccion.length > escalaMaxima) {
    throw new ErrorValidacionFel(
      `${campo} excede la precisión decimal permitida.`,
    )
  }

  return {
    coeficiente: BigInt(`${entero}${fraccion}`),
    escala: fraccion.length,
  }
}

export function sumarDecimales(a, b) {
  const escala = Math.max(a.escala, b.escala)

  return {
    coeficiente:
      a.coeficiente * potenciaDiez(escala - a.escala) +
      b.coeficiente * potenciaDiez(escala - b.escala),
    escala,
  }
}

export function multiplicarDecimalPorEntero(decimal, entero, campo) {
  if (!Number.isSafeInteger(entero) || entero < 0) {
    throw new ErrorValidacionFel(`${campo} no es un entero válido.`)
  }

  return {
    coeficiente: decimal.coeficiente * BigInt(entero),
    escala: decimal.escala,
  }
}

export function compararDecimales(a, b) {
  const escala = Math.max(a.escala, b.escala)
  const coeficienteA = a.coeficiente * potenciaDiez(escala - a.escala)
  const coeficienteB = b.coeficiente * potenciaDiez(escala - b.escala)

  if (coeficienteA < coeficienteB) return -1
  if (coeficienteA > coeficienteB) return 1
  return 0
}

export function formatearDecimal(decimal, escalaMinima = 0) {
  const escala = Math.max(decimal.escala, escalaMinima)
  const coeficiente =
    decimal.coeficiente * potenciaDiez(escala - decimal.escala)
  const digitos = coeficiente.toString().padStart(escala + 1, '0')

  if (escala === 0) return digitos

  const posicion = digitos.length - escala
  return `${digitos.slice(0, posicion)}.${digitos.slice(posicion)}`
}

export const DECIMAL_CERO = Object.freeze({ coeficiente: 0n, escala: 0 })
