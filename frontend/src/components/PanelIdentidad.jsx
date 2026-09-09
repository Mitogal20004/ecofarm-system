import logoEfarm from '../assets/logo-efarm-brand.png'

function PanelIdentidad() {
  return (
    <section className="panel-identidad" aria-labelledby="marca-efarm">
      <div className="contenido-identidad">
        <div className="marca-ecofarm">
          <img
            id="marca-efarm"
            className="logo-login"
            src={logoEfarm}
            alt="E-farm"
          />
        </div>

        <div className="mensaje-identidad">
          <p className="sobrelinea">Sistema administrativo</p>
          <h1>Gestión clara para cada operación.</h1>
          <p>
            Administra los procesos internos de E-farm desde un entorno seguro y
            centralizado.
          </p>
        </div>
      </div>
    </section>
  )
}

export default PanelIdentidad
