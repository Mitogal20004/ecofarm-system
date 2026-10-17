import { ErrorConfiguracionTekra } from './errores.js'

const leerTexto = (entorno, nombre, { opcional = false } = {}) => {
  const valor = entorno[nombre]

  if (typeof valor !== 'string' || !valor.trim()) {
    if (opcional) return null
    throw new ErrorConfiguracionTekra(`Falta la configuración ${nombre}.`)
  }

  return valor.trim()
}

const leerEntero = (entorno, nombre, valorPredeterminado) => {
  const valor = entorno[nombre]
  if (valor === undefined || valor === '') return valorPredeterminado

  const numero = Number(valor)
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new ErrorConfiguracionTekra(`${nombre} debe ser un entero positivo.`)
  }

  return numero
}

const leerSiNo = (entorno, nombre) => {
  const valor = leerTexto(entorno, nombre).toUpperCase()
  if (valor !== 'SI' && valor !== 'NO') {
    throw new ErrorConfiguracionTekra(`${nombre} debe ser SI o NO.`)
  }
  return valor
}

const leerUrlHttps = (entorno, nombre) => {
  const texto = leerTexto(entorno, nombre)
  let url

  try {
    url = new URL(texto)
  } catch {
    throw new ErrorConfiguracionTekra(`${nombre} no es una URL válida.`)
  }

  if (url.protocol !== 'https:') {
    throw new ErrorConfiguracionTekra(
      `${nombre} debe utilizar HTTPS antes de enviar credenciales.`,
    )
  }

  return url.toString()
}

const leerFrases = (entorno) => {
  const texto = leerTexto(entorno, 'FEL_FRASES_JSON')
  let frases

  try {
    frases = JSON.parse(texto)
  } catch {
    throw new ErrorConfiguracionTekra('FEL_FRASES_JSON no contiene JSON válido.')
  }

  return frases
}

const exigirTextoFiscal = (valor, campo, { opcional = false } = {}) => {
  if (valor === null || valor === undefined) {
    if (opcional) return null
    throw new ErrorConfiguracionTekra(`${campo} es obligatorio.`)
  }

  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErrorConfiguracionTekra(`${campo} es obligatorio.`)
  }

  return valor.trim()
}

const exigirNitNormalizado = (valor) => {
  const nit = exigirTextoFiscal(valor, 'emisor.nit')
  const normalizado = nit.replace(/[\s-]+/g, '').toUpperCase()

  if (nit !== normalizado) {
    throw new ErrorConfiguracionTekra(
      'FEL_EMISOR_NIT debe estar normalizado, sin espacios ni guiones.',
    )
  }

  return nit
}

const validarCorreo = (correo) => {
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new ErrorConfiguracionTekra(
      'FEL_EMISOR_CORREO no tiene un formato válido.',
    )
  }

  return correo
}

export function validarConfiguracionFiscalFel(configuracion) {
  if (configuracion?.contratoXmlConfirmado !== true) {
    throw new ErrorConfiguracionTekra(
      'El contrato XML FEL no ha sido confirmado para producción.',
    )
  }

  if (!Array.isArray(configuracion.frases) || configuracion.frases.length === 0) {
    throw new ErrorConfiguracionTekra(
      'FEL_FRASES_JSON debe declarar frases fiscales confirmadas.',
    )
  }

  const frases = configuracion.frases.map((frase, indice) => {
    if (!frase || typeof frase !== 'object' || Array.isArray(frase)) {
      throw new ErrorConfiguracionTekra(
        `La frase fiscal ${indice + 1} no es válida.`,
      )
    }

    return {
      tipoFrase: exigirTextoFiscal(
        frase.tipoFrase,
        `frases[${indice}].tipoFrase`,
      ),
      codigoEscenario: exigirTextoFiscal(
        frase.codigoEscenario,
        `frases[${indice}].codigoEscenario`,
      ),
    }
  })
  const claves = frases.map(
    (frase) => `${frase.tipoFrase}\u0000${frase.codigoEscenario}`,
  )
  if (new Set(claves).size !== claves.length) {
    throw new ErrorConfiguracionTekra(
      'FEL_FRASES_JSON contiene frases fiscales duplicadas.',
    )
  }

  const emisor = configuracion.emisor
  const correo = validarCorreo(
    exigirTextoFiscal(emisor?.correo, 'emisor.correo', { opcional: true }),
  )

  return {
    contratoXmlConfirmado: true,
    emisor: {
      nit: exigirNitNormalizado(emisor?.nit),
      nombre: exigirTextoFiscal(emisor?.nombre, 'emisor.nombre'),
      nombreComercial: exigirTextoFiscal(
        emisor?.nombreComercial,
        'emisor.nombreComercial',
      ),
      afiliacionIva: exigirTextoFiscal(
        emisor?.afiliacionIva,
        'emisor.afiliacionIva',
      ),
      codigoEstablecimiento: exigirTextoFiscal(
        emisor?.codigoEstablecimiento,
        'emisor.codigoEstablecimiento',
      ),
      correo,
      direccion: {
        direccion: exigirTextoFiscal(
          emisor?.direccion?.direccion,
          'emisor.direccion.direccion',
        ),
        codigoPostal: exigirTextoFiscal(
          emisor?.direccion?.codigoPostal,
          'emisor.direccion.codigoPostal',
        ),
        municipio: exigirTextoFiscal(
          emisor?.direccion?.municipio,
          'emisor.direccion.municipio',
        ),
        departamento: exigirTextoFiscal(
          emisor?.direccion?.departamento,
          'emisor.direccion.departamento',
        ),
        pais: exigirTextoFiscal(
          emisor?.direccion?.pais,
          'emisor.direccion.pais',
        ),
      },
    },
    frases,
  }
}

export function cargarConfiguracionTekra(entorno = process.env) {
  const validarIdentificador = leerSiNo(
    entorno,
    'TEKRA_VALIDAR_IDENTIFICADOR',
  )

  if (validarIdentificador !== 'SI') {
    throw new ErrorConfiguracionTekra(
      'TEKRA_VALIDAR_IDENTIFICADOR debe permanecer en SI para idempotencia.',
    )
  }

  return {
    endpoint: leerUrlHttps(entorno, 'TEKRA_SOAP_ENDPOINT'),
    namespaceOperacion: leerTexto(entorno, 'TEKRA_SOAP_NAMESPACE'),
    soapAction: leerTexto(entorno, 'TEKRA_SOAP_ACTION'),
    timeoutMs: leerEntero(entorno, 'TEKRA_TIMEOUT_MS', 15000),
    maxRespuestaBytes: leerEntero(
      entorno,
      'TEKRA_MAX_RESPUESTA_BYTES',
      25 * 1024 * 1024,
    ),
    maxPdfBytes: leerEntero(
      entorno,
      'TEKRA_MAX_PDF_BYTES',
      20 * 1024 * 1024,
    ),
    autenticacion: {
      pn_usuario: leerTexto(entorno, 'TEKRA_USUARIO'),
      pn_clave: leerTexto(entorno, 'TEKRA_CLAVE'),
      pn_cliente: leerTexto(entorno, 'TEKRA_CLIENTE'),
      pn_contrato: leerTexto(entorno, 'TEKRA_CONTRATO'),
      pn_id_origen: leerTexto(entorno, 'TEKRA_ID_ORIGEN'),
      pn_ip_origen: leerTexto(entorno, 'TEKRA_IP_ORIGEN'),
      pn_firmar_emisor: leerSiNo(entorno, 'TEKRA_FIRMAR_EMISOR'),
      pn_validar_identificador: validarIdentificador,
    },
  }
}

export function cargarConfiguracionFiscalFel(entorno = process.env) {
  if (leerTexto(entorno, 'FEL_XML_CONTRATO_CONFIRMADO') !== 'SI') {
    throw new ErrorConfiguracionTekra(
      'El contrato XML FEL debe confirmarse antes de generar documentos.',
    )
  }

  return validarConfiguracionFiscalFel({
    contratoXmlConfirmado: true,
    emisor: {
      nit: leerTexto(entorno, 'FEL_EMISOR_NIT'),
      nombre: leerTexto(entorno, 'FEL_EMISOR_NOMBRE'),
      nombreComercial: leerTexto(entorno, 'FEL_EMISOR_NOMBRE_COMERCIAL'),
      afiliacionIva: leerTexto(entorno, 'FEL_EMISOR_AFILIACION_IVA'),
      codigoEstablecimiento: leerTexto(
        entorno,
        'FEL_EMISOR_CODIGO_ESTABLECIMIENTO',
      ),
      correo: leerTexto(entorno, 'FEL_EMISOR_CORREO', { opcional: true }),
      direccion: {
        direccion: leerTexto(entorno, 'FEL_EMISOR_DIRECCION'),
        codigoPostal: leerTexto(entorno, 'FEL_EMISOR_CODIGO_POSTAL'),
        municipio: leerTexto(entorno, 'FEL_EMISOR_MUNICIPIO'),
        departamento: leerTexto(entorno, 'FEL_EMISOR_DEPARTAMENTO'),
        pais: leerTexto(entorno, 'FEL_EMISOR_PAIS'),
      },
    },
    frases: leerFrases(entorno),
  })
}
