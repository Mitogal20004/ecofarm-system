# E-farm | Identidad visual administrativa

## Objetivo

Una consola de operaciones para ECOFARM S.A., con personalidad agrícola discreta y uso cotidiano.
No se busca imitar un dashboard SaaS de demostración.

## Principios visuales

1. **Datos primero.** Filtros y tablas deben ser más importantes que los contenedores decorativos.
2. **Íconos con función.** Navegación y acciones operativas sí; indicadores, titulares y tarjetas sin iconografía ornamental.
3. **Tipografía compacta.** Encabezados de 23–28 px; tablas y controles de 12–14 px; números legibles sin gigantismo.
4. **Un acento de marca.** Verde bosque como identidad; blanco y gris cálido para trabajo; rojo y ámbar solo para estados reales.
5. **Pocas superficies.** Bordes de 1 px y radio de 5–6 px. Sin sombras continuas, degradados o círculos decorativos.
6. **Consistencia operativa.** La acción primaria se encuentra donde se espera (arriba a la derecha en listados y en el área de confirmación en formularios).
7. **Logotipo y login preservados.** Los estilos nuevos solo aplican dentro de `.aplicacion-administrativa` y bajo `@media screen`.

## Identidad

- Fondo: `#f7f7f4`
- Menú: `#203a30`
- Acción primaria: `#2d5947`
- Texto: `#26332b`
- Bordes: `#e2e7e1`
- Paneles: `#ffffff`

## Módulos

- **Inicio:** resumen operativo sin íconos y últimas ventas como listado.
- **Ventas:** POS con jerarquía producto → cliente → total → confirmar; la impresión conserva sus estilos actuales.
- **Caja:** apertura, movimientos y cierres con información más visible que las tarjetas.
- **Inventario:** alertas discretas y tabla densa con filtros arriba.
- **Productos / Clientes / Usuarios:** tablas y formularios consistentes.
- **Cotizaciones:** documento comercial y acciones claras.
- **Reportes:** indicadores pequeños y resultados tabulares.

## Cambios hechos en esta fase

- Nueva hoja `frontend/src/styles/efarm-business.css` exclusiva del área autenticada.
- Menú lateral oscuro integrado, barra superior blanca y contenido ancho.
- Actualización del encabezado y navegación en `App.jsx`.
- Inicio reescrito visualmente para mostrar indicadores compactos y actividad reciente sin íconos decorativos.
- Íconos SVG más sobrios y consistentes para Ventas, Caja, Inventario y Productos.
- Botones, filtros, tablas y paneles ajustados a un mismo lenguaje visual.

## Qué falta comprobar antes de fusionar

Desde `frontend/`:

```bash
npm ci
npm run lint
npm run build
```

Revisar manualmente login sin cambios y navegación con permisos de usuario, además de Inicio, Ventas, Caja, Inventario, Productos, Clientes, Cotizaciones, Reportes y Usuarios en escritorio y móvil. Validar especialmente impresión en carta y tickets porque el rediseño no debe cambiar medios `print`.

**Esta rama no modifica APIs, la base de datos, Render ni el login.**
