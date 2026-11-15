import { useState } from 'react'
import { Button, Card, CardBody, Chip, Input } from '@heroui/react'
import { House, Save, X } from 'lucide-react'
import { actualizarPerfilUsuario } from '../services/usuarios'
import './Perfil.css'

const PAISES_TELEFONO = [
  { codigo: '+502', iso: 'gt', nombre: 'Guatemala' },
  { codigo: '+52', iso: 'mx', nombre: 'México' },
  { codigo: '+1', iso: 'us', nombre: 'Estados Unidos' },
  { codigo: '+34', iso: 'es', nombre: 'España' },
  { codigo: '+503', iso: 'sv', nombre: 'El Salvador' },
  { codigo: '+504', iso: 'hn', nombre: 'Honduras' },
  { codigo: '+505', iso: 'ni', nombre: 'Nicaragua' },
  { codigo: '+506', iso: 'cr', nombre: 'Costa Rica' },
  { codigo: '+507', iso: 'pa', nombre: 'Panamá' },
]

const obtenerUrlBandera = (iso) => `https://flagcdn.com/${iso}.svg`

function separarTelefono(telefono) {
  const valor = String(telefono ?? '').replace(/[^\d+]/g, '')
  const pais = PAISES_TELEFONO.find((opcion) => valor.startsWith(opcion.codigo))

  if (!pais) return { codigo: PAISES_TELEFONO[0].codigo, local: valor.replace(/^\+/, '') }
  return { codigo: pais.codigo, local: valor.slice(pais.codigo.length).replace(/^\+/, '') }
}

function obtenerMensajeError(error) {
  if (error?.status === 401) return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'
  if (error?.status === 403) return 'No tienes permiso para modificar este perfil.'
  if (error?.status === 400) return 'Revisa los datos ingresados e intenta nuevamente.'
  return 'No fue posible actualizar tu perfil.'
}

function obtenerIniciales(nombre) {
  const palabras = String(nombre || 'Cuenta E-farm').trim().split(/\s+/)
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return `${palabras[0][0]}${palabras[palabras.length - 1][0]}`.toUpperCase()
}

function Perfil({ perfil, alGuardar, alVolver, alRefrescarAutorizacion }) {
  const [nombreCompleto, setNombreCompleto] = useState(perfil?.nombre_completo ?? '')
  const telefonoInicial = separarTelefono(perfil?.telefono)
  const [paisTelefono, setPaisTelefono] = useState(telefonoInicial.codigo)
  const [telefono, setTelefono] = useState(telefonoInicial.local)
  const [selectorPaisAbierto, setSelectorPaisAbierto] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  const manejarEnvio = async (evento) => {
    evento.preventDefault()
    const nombre = nombreCompleto.trim()
    const telefonoNormalizado = telefono.replace(/\D/g, '')
    const telefonoCompleto = telefonoNormalizado
      ? `${paisTelefono}${telefonoNormalizado}`
      : null

    setError('')
    setMensaje('')

    if (!nombre || nombre.length > 150) {
      setError('Ingresa un nombre completo válido.')
      return
    }

    if (telefonoNormalizado && (telefonoNormalizado.length < 7 || telefonoNormalizado.length > 15)) {
      setError('Ingresa un número telefónico válido, incluyendo su código de país.')
      return
    }

    const cambios = {}
    if (nombre !== perfil?.nombre_completo) cambios.nombre_completo = nombre
    if (telefonoCompleto !== (perfil?.telefono ?? null)) {
      cambios.telefono = telefonoCompleto
    }

    if (Object.keys(cambios).length === 0) {
      setMensaje('No hay cambios por guardar.')
      return
    }

    setGuardando(true)
    try {
      const resultado = await actualizarPerfilUsuario(perfil.id, cambios)
      alGuardar(resultado.perfil)
      setMensaje('Perfil actualizado correctamente.')
    } catch (errorActualizacion) {
      setError(obtenerMensajeError(errorActualizacion))
      if ([401, 403].includes(errorActualizacion?.status)) {
        alRefrescarAutorizacion?.()
      }
    } finally {
      setGuardando(false)
    }
  }

  const paisSeleccionado = PAISES_TELEFONO.find((pais) => pais.codigo === paisTelefono) ?? PAISES_TELEFONO[0]
  const cantidadDigitosTelefono = telefono.replace(/\D/g, '').length
  const mensajeTelefono = cantidadDigitosTelefono > 15
    ? 'El número no puede superar los 15 dígitos.'
    : cantidadDigitosTelefono > 0 && cantidadDigitosTelefono < 7
      ? `Aún faltan ${7 - cantidadDigitosTelefono} dígitos.`
      : ''

  return (
    <div className="perfil-panel">
      <header className="perfil-cabecera">
        <div className="perfil-ruta">
          <span className="perfil-indice">CUENTA / PERFIL</span>
          <h1>Mi perfil</h1>
          <p>Tu identidad dentro del espacio de trabajo E-farm.</p>
        </div>
        <Button variant="bordered" onPress={alVolver} className="perfil-boton-volver">
          <House size={16} strokeWidth={1.9} aria-hidden="true" />
          Volver al inicio
        </Button>
      </header>

      <Card className="perfil-identidad" shadow="sm">
        <CardBody>
          <div className="perfil-identidad-contenido">
            <span className="perfil-avatar" aria-hidden="true">{obtenerIniciales(nombreCompleto)}</span>
            <div>
              <span className="perfil-identidad-etiqueta">PERFIL ACTIVO</span>
              <strong>{nombreCompleto || 'Cuenta E-farm'}</strong>
              <span>Información personal y preferencias de cuenta</span>
            </div>
            <Chip color="success" variant="flat" size="sm">Activo</Chip>
          </div>
        </CardBody>
      </Card>

      <Card className="perfil-formulario" shadow="sm">
        <CardBody>
          <form onSubmit={manejarEnvio}>
            <div className="perfil-formulario-cabecera">
              <div>
                <span className="perfil-seccion-indice">01 / INFORMACIÓN PERSONAL</span>
                <h2>Datos de usuario</h2>
              </div>
              {mensaje && <span className="perfil-mensaje-exito">{mensaje}</span>}
            </div>

            <div className="perfil-campos">
              <Input
                className="perfil-campo"
                label="Nombre completo"
                variant="bordered"
                value={nombreCompleto}
                onValueChange={setNombreCompleto}
                maxLength={150}
                autoComplete="name"
                isRequired
              />
              <div className="perfil-telefono-campo">
                <label htmlFor="pais-telefono">Teléfono</label>
                <div className="perfil-telefono-control">
                  <div className="perfil-selector-pais">
                    <button
                      id="pais-telefono"
                      type="button"
                      className="perfil-selector-pais-boton"
                      onClick={() => setSelectorPaisAbierto((abierto) => !abierto)}
                      aria-label="Código de país"
                      aria-expanded={selectorPaisAbierto}
                      aria-haspopup="listbox"
                    >
                      <img src={obtenerUrlBandera(paisSeleccionado.iso)} alt="" />
                      <span>{paisSeleccionado.codigo}</span>
                      <span className="perfil-selector-flecha" aria-hidden="true">▾</span>
                    </button>
                    {selectorPaisAbierto && (
                      <div className="perfil-selector-pais-lista" role="listbox" aria-label="Selecciona un país">
                        {PAISES_TELEFONO.map((pais) => (
                          <button
                            key={pais.codigo}
                            type="button"
                            role="option"
                            aria-selected={pais.codigo === paisTelefono}
                            onClick={() => {
                              setPaisTelefono(pais.codigo)
                              setSelectorPaisAbierto(false)
                            }}
                          >
                            <img src={obtenerUrlBandera(pais.iso)} alt="" />
                            <span>{pais.nombre}</span>
                            <strong>{pais.codigo}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input
                    className="perfil-campo perfil-numero-telefono"
                    aria-label="Número telefónico"
                    variant="bordered"
                    value={telefono}
                    onValueChange={(valor) => setTelefono(valor.replace(/\D/g, ''))}
                    maxLength={20}
                    autoComplete="tel"
                    placeholder="55555555"
                    isInvalid={Boolean(mensajeTelefono)}
                    aria-describedby="ayuda-telefono"
                  />
                </div>
                <span
                  id="ayuda-telefono"
                  className={`perfil-telefono-ayuda${mensajeTelefono ? ' perfil-telefono-ayuda-error' : ''}`}
                  role={mensajeTelefono ? 'alert' : undefined}
                >
                  {mensajeTelefono || `Se guardará como ${paisTelefono}${telefono || 'XXXXXXXX'}`}
                </span>
              </div>
            </div>

            {error && <p className="perfil-mensaje-error" role="alert">{error}</p>}

            <div className="perfil-formulario-acciones">
              <Button type="button" variant="bordered" className="perfil-boton-secundario" onPress={alVolver}>
                <X size={16} strokeWidth={2.2} aria-hidden="true" />
                Cancelar
              </Button>
              <Button type="submit" color="success" className="perfil-boton-guardar" isLoading={guardando}>
                {!guardando && <Save size={16} strokeWidth={2.2} aria-hidden="true" />}
                Guardar cambios
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

export default Perfil
