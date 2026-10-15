import { ErrorRespuestaTekra, ErrorValidacionFel } from './errores.js'

const PATRON_NOMBRE_XML = /^[A-Za-z_][A-Za-z0-9_.:-]*$/
const PATRON_ENTIDAD = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g
const PATRON_ENTIDAD_INCOMPLETA = /&[^;\s<]*;/

const esCodigoXmlValido = (codigo) =>
  codigo === 0x09 ||
  codigo === 0x0a ||
  codigo === 0x0d ||
  (codigo >= 0x20 && codigo <= 0xd7ff) ||
  (codigo >= 0xe000 && codigo <= 0xfffd) ||
  (codigo >= 0x10000 && codigo <= 0x10ffff)

const validarCaracteresXml = (texto, crearError) => {
  for (const caracter of texto) {
    if (!esCodigoXmlValido(caracter.codePointAt(0))) {
      throw crearError('El XML contiene caracteres no permitidos.')
    }
  }
}

export function escaparTextoXml(valor) {
  const texto = String(valor)
  validarCaracteresXml(texto, (mensaje) => new ErrorValidacionFel(mensaje))

  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function escaparAtributoXml(valor) {
  return escaparTextoXml(valor)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function envolverCdata(valor) {
  const texto = String(valor)
  validarCaracteresXml(texto, (mensaje) => new ErrorValidacionFel(mensaje))
  return `<![CDATA[${texto.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
}

const decodificarEntidades = (texto) => {
  const textoSinEntidadesPermitidas = texto.replace(PATRON_ENTIDAD, '')

  if (PATRON_ENTIDAD_INCOMPLETA.test(textoSinEntidadesPermitidas) ||
    textoSinEntidadesPermitidas.includes('&')) {
    throw new ErrorRespuestaTekra(
      'El XML contiene entidades no permitidas o desconocidas.',
    )
  }

  const reemplazado = texto.replace(PATRON_ENTIDAD, (entidad, codigo) => {
    const entidades = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    }

    if (entidades[codigo]) return entidades[codigo]

    const numero = codigo.startsWith('#x')
      ? Number.parseInt(codigo.slice(2), 16)
      : Number.parseInt(codigo.slice(1), 10)

    if (!Number.isInteger(numero) || !esCodigoXmlValido(numero)) {
      throw new ErrorRespuestaTekra('El XML contiene una entidad inválida.')
    }

    return String.fromCodePoint(numero)
  })

  return reemplazado
}

const encontrarFinEtiqueta = (xml, inicio) => {
  let comilla = null

  for (let indice = inicio; indice < xml.length; indice += 1) {
    const caracter = xml[indice]

    if (comilla) {
      if (caracter === comilla) comilla = null
    } else if (caracter === '"' || caracter === "'") {
      comilla = caracter
    } else if (caracter === '>') {
      return indice
    }
  }

  return -1
}

const parsearAtributos = (contenido) => {
  const atributos = new Map()
  let posicion = 0

  while (posicion < contenido.length) {
    while (/\s/.test(contenido[posicion])) posicion += 1
    if (posicion >= contenido.length) break

    const resto = contenido.slice(posicion)
    const coincidenciaNombre = resto.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)

    if (!coincidenciaNombre) {
      throw new ErrorRespuestaTekra('El XML contiene atributos inválidos.')
    }

    const nombre = coincidenciaNombre[1]
    posicion += nombre.length
    while (/\s/.test(contenido[posicion])) posicion += 1

    if (contenido[posicion] !== '=') {
      throw new ErrorRespuestaTekra('El XML contiene atributos inválidos.')
    }

    posicion += 1
    while (/\s/.test(contenido[posicion])) posicion += 1

    const comilla = contenido[posicion]
    if (comilla !== '"' && comilla !== "'") {
      throw new ErrorRespuestaTekra('El XML contiene atributos inválidos.')
    }

    const fin = contenido.indexOf(comilla, posicion + 1)
    if (fin < 0) {
      throw new ErrorRespuestaTekra('El XML contiene atributos inválidos.')
    }

    if (atributos.has(nombre)) {
      throw new ErrorRespuestaTekra('El XML repite un atributo.')
    }

    atributos.set(
      nombre,
      decodificarEntidades(contenido.slice(posicion + 1, fin)),
    )
    posicion = fin + 1
  }

  return atributos
}

const agregarTexto = (nodo, texto, esCdata = false) => {
  if (!nodo && texto.trim()) {
    throw new ErrorRespuestaTekra('El XML contiene texto fuera de la raíz.')
  }

  if (!nodo) return
  nodo.textos.push(esCdata ? texto : decodificarEntidades(texto))
}

export function parsearXmlSeguro(
  xml,
  { maxBytes = 25 * 1024 * 1024, maxProfundidad = 64, maxNodos = 20000 } = {},
) {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new ErrorRespuestaTekra('La respuesta XML está vacía.')
  }

  if (Buffer.byteLength(xml, 'utf8') > maxBytes) {
    throw new ErrorRespuestaTekra('La respuesta XML excede el tamaño permitido.')
  }

  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ErrorRespuestaTekra('La respuesta XML contiene DTD o entidades.')
  }

  validarCaracteresXml(xml, (mensaje) => new ErrorRespuestaTekra(mensaje))

  const pila = []
  let raiz = null
  let posicion = 0
  let cantidadNodos = 0

  while (posicion < xml.length) {
    const inicioEtiqueta = xml.indexOf('<', posicion)

    if (inicioEtiqueta < 0) {
      agregarTexto(pila.at(-1), xml.slice(posicion))
      break
    }

    agregarTexto(pila.at(-1), xml.slice(posicion, inicioEtiqueta))

    if (xml.startsWith('<!--', inicioEtiqueta)) {
      const finComentario = xml.indexOf('-->', inicioEtiqueta + 4)
      if (finComentario < 0) {
        throw new ErrorRespuestaTekra('El comentario XML no está cerrado.')
      }
      posicion = finComentario + 3
      continue
    }

    if (xml.startsWith('<?', inicioEtiqueta)) {
      const finInstruccion = xml.indexOf('?>', inicioEtiqueta + 2)
      if (finInstruccion < 0) {
        throw new ErrorRespuestaTekra('La instrucción XML no está cerrada.')
      }
      posicion = finInstruccion + 2
      continue
    }

    if (xml.startsWith('<![CDATA[', inicioEtiqueta)) {
      const finCdata = xml.indexOf(']]>', inicioEtiqueta + 9)
      if (finCdata < 0) {
        throw new ErrorRespuestaTekra('La sección CDATA no está cerrada.')
      }
      agregarTexto(
        pila.at(-1),
        xml.slice(inicioEtiqueta + 9, finCdata),
        true,
      )
      posicion = finCdata + 3
      continue
    }

    if (xml.startsWith('<!', inicioEtiqueta)) {
      throw new ErrorRespuestaTekra('La declaración XML no está permitida.')
    }

    const finEtiqueta = encontrarFinEtiqueta(xml, inicioEtiqueta + 1)
    if (finEtiqueta < 0) {
      throw new ErrorRespuestaTekra('La etiqueta XML no está cerrada.')
    }

    const contenidoOriginal = xml
      .slice(inicioEtiqueta + 1, finEtiqueta)
      .trim()

    if (contenidoOriginal.startsWith('/')) {
      const nombre = contenidoOriginal.slice(1).trim()
      const actual = pila.pop()

      if (!PATRON_NOMBRE_XML.test(nombre) || actual?.nombre !== nombre) {
        throw new ErrorRespuestaTekra('Las etiquetas XML no están balanceadas.')
      }

      actual.finContenido = inicioEtiqueta
      actual.finNodo = finEtiqueta + 1
    } else {
      const autocierre = contenidoOriginal.endsWith('/')
      const contenido = autocierre
        ? contenidoOriginal.slice(0, -1).trim()
        : contenidoOriginal
      const coincidenciaNombre = contenido.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)

      if (!coincidenciaNombre) {
        throw new ErrorRespuestaTekra('El XML contiene una etiqueta inválida.')
      }

      const nombre = coincidenciaNombre[1]
      const nodo = {
        nombre,
        nombreLocal: nombre.includes(':') ? nombre.split(':').at(-1) : nombre,
        atributos: parsearAtributos(contenido.slice(nombre.length)),
        hijos: [],
        textos: [],
        inicioContenido: finEtiqueta + 1,
        finContenido: autocierre ? finEtiqueta + 1 : null,
        finNodo: autocierre ? finEtiqueta + 1 : null,
      }

      cantidadNodos += 1
      if (cantidadNodos > maxNodos) {
        throw new ErrorRespuestaTekra('El XML excede el número de nodos permitido.')
      }

      const padre = pila.at(-1)
      if (padre) padre.hijos.push(nodo)
      else if (raiz) {
        throw new ErrorRespuestaTekra('El XML contiene más de una raíz.')
      } else {
        raiz = nodo
      }

      if (!autocierre) {
        pila.push(nodo)
        if (pila.length > maxProfundidad) {
          throw new ErrorRespuestaTekra('El XML excede la profundidad permitida.')
        }
      }
    }

    posicion = finEtiqueta + 1
  }

  if (!raiz || pila.length > 0) {
    throw new ErrorRespuestaTekra('El XML está incompleto.')
  }

  return raiz
}

export function buscarPrimerNodoLocal(nodo, nombreLocal) {
  if (nodo.nombreLocal === nombreLocal) return nodo

  for (const hijo of nodo.hijos) {
    const encontrado = buscarPrimerNodoLocal(hijo, nombreLocal)
    if (encontrado) return encontrado
  }

  return null
}

export const textoNodo = (nodo) => nodo.textos.join('').trim()

export function contenidoXmlNodo(xml, nodo) {
  if (
    typeof xml !== 'string' ||
    !nodo ||
    !Number.isSafeInteger(nodo.inicioContenido) ||
    !Number.isSafeInteger(nodo.finContenido) ||
    nodo.inicioContenido > nodo.finContenido
  ) {
    throw new ErrorRespuestaTekra(
      'No fue posible extraer el contenido XML del nodo.',
    )
  }

  return xml.slice(nodo.inicioContenido, nodo.finContenido).trim()
}

export function textoProfundoNodo(nodo) {
  return [
    ...nodo.textos,
    ...nodo.hijos.map((hijo) => textoProfundoNodo(hijo)),
  ]
    .join(' ')
    .trim()
}
