export class ErrorConfiguracionTekra extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorConfiguracionTekra'
  }
}

export class ErrorValidacionFel extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorValidacionFel'
  }
}

export class ErrorRespuestaTekra extends Error {
  constructor(mensaje, causa) {
    super(mensaje, causa ? { cause: causa } : undefined)
    this.name = 'ErrorRespuestaTekra'
  }
}

export class ErrorResultadoInciertoTekra extends Error {
  constructor(mensaje, causa) {
    super(mensaje, causa ? { cause: causa } : undefined)
    this.name = 'ErrorResultadoInciertoTekra'
  }
}
