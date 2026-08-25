# Guía visual inicial de ECOFARM S.A.

Esta guía define una dirección visual inicial para el sistema web de gestión/POS de ECOFARM S.A. Su propósito es orientar las futuras decisiones de interfaz sin convertirlas todavía en una implementación. Los valores propuestos podrán ajustarse después de validar el logotipo, las condiciones reales de uso y las necesidades de los usuarios.

## 1. Objetivo visual

Construir una interfaz moderna, empresarial y limpia que transmita orden, confianza y relación con el sector agrícola. El sistema debe facilitar operaciones internas rápidas y precisas, especialmente en ventas e inventario, sin copiar la apariencia de las referencias funcionales existentes.

La identidad agrícola debe expresarse de forma sobria mediante el color, el espacio y recursos visuales puntuales. Deben evitarse decoraciones excesivas, ilustraciones genéricas que distraigan y elementos que reduzcan la legibilidad.

## 2. Principios de diseño

- **Claridad:** cada pantalla debe mostrar primero la información y las acciones necesarias para completar la tarea.
- **Rapidez:** los flujos frecuentes deben requerir pocos pasos y favorecer el uso de teclado.
- **Consistencia:** controles equivalentes deben conservar apariencia, posición y comportamiento.
- **Jerarquía:** tamaño, peso, contraste y espacio deben indicar qué es principal, secundario o auxiliar.
- **Sobriedad:** utilizar una paleta limitada, sombras discretas y animaciones solo cuando comuniquen un cambio de estado.
- **Accesibilidad:** no depender únicamente del color; mantener contraste suficiente, foco visible y áreas de interacción cómodas.
- **Prevención de errores:** diferenciar claramente las acciones destructivas y solicitar confirmación cuando una operación sea difícil de revertir.
- **Información contextual:** mostrar totales, existencias, cliente y estado cerca del punto donde se toman decisiones.
- **Adaptabilidad:** diseñar primero para escritorio sin impedir el uso razonable en tablet o móvil.

## 3. Paleta de colores inicial

Los colores son valores iniciales. Antes de adoptarlos definitivamente deberán comprobarse con el logotipo oficial y mediante pruebas de contraste.

| Uso | Color | HEX |
| --- | --- | --- |
| Verde principal | Bosque | `#174D36` |
| Verde principal al pasar el cursor | Bosque oscuro | `#103A28` |
| Verde secundario | Hoja | `#3F7D5B` |
| Verde suave | Fondo positivo | `#E7F2EB` |
| Fondo principal | Gris cálido claro | `#F6F8F5` |
| Fondo alternativo | Crema claro | `#FAF8F2` |
| Superficie | Blanco | `#FFFFFF` |
| Texto principal | Gris carbón | `#24312B` |
| Texto secundario | Gris verdoso | `#647169` |
| Bordes | Gris suave | `#DCE4DE` |
| Error o acción destructiva | Rojo oscuro | `#B42318` |
| Fondo de error | Rojo muy claro | `#FDECEA` |
| Advertencia o stock bajo | Naranja oscuro | `#B54708` |
| Fondo de advertencia | Naranja muy claro | `#FFF3E0` |
| Éxito o confirmado | Verde de estado | `#167A4B` |
| Fondo de éxito | Verde muy claro | `#E8F5EE` |
| Elemento deshabilitado | Gris medio | `#A7B0AA` |

Reglas de uso:

- El verde oscuro será el color de identidad y de las acciones principales.
- El fondo general utilizará gris cálido claro; el crema se reservará para áreas puntuales de identidad o bienvenida.
- El rojo se reservará para errores, eliminación, cancelación o anulación.
- El naranja se utilizará para advertencias y stock bajo.
- Las superficies de trabajo y tablas serán predominantemente blancas.
- Los textos extensos no deberán utilizar verde; se priorizará el gris carbón por legibilidad.

## 4. Tipografía recomendada

Se recomienda una tipografía sans serif de alta legibilidad. La opción inicial es `Inter`; mientras no se autorice su incorporación, debe utilizarse una pila de fuentes del sistema:

```text
Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
```

Escala inicial:

| Uso | Tamaño | Peso sugerido |
| --- | --- | --- |
| Título principal | 28 px | 700 |
| Título de sección | 22 px | 600 |
| Título de tarjeta | 18 px | 600 |
| Texto normal | 16 px | 400 |
| Texto auxiliar | 14 px | 400 |
| Etiqueta pequeña | 12 px | 600 |

La altura de línea será aproximadamente `1.4` para controles y `1.5` para textos. Precios, cantidades, NIT y totales deben usar números tabulares cuando la fuente lo permita, para facilitar su comparación.

## 5. Espaciados

Se utilizará una escala basada en múltiplos de 4 px:

```text
4, 8, 12, 16, 24, 32, 40, 48 y 64 px
```

- Separación interna mínima de controles: 12 px.
- Separación habitual entre campos: 16 px.
- Separación entre grupos de formulario: 24 px.
- Relleno de tarjetas: 20 o 24 px.
- Separación entre secciones principales: 32 px.
- Márgenes laterales del contenido en escritorio: 24 o 32 px.

No deben introducirse valores arbitrarios si uno de los valores de la escala resuelve la necesidad.

## 6. Bordes y radios

- Borde estándar: `1 px` con color `#DCE4DE`.
- Radio de campos y botones: `8 px`.
- Radio de tarjetas y paneles: `12 px`.
- Radio de etiquetas de estado: entre `999 px` y forma de píldora.
- Separadores: líneas de `1 px`, sin contraste excesivo.

Los radios deben ser suaves pero no exagerados. No se mezclarán estilos rectos y muy redondeados sin una razón funcional.

## 7. Sombras

Las sombras se reservarán para superficies elevadas, menús flotantes y diálogos.

```text
Tarjeta: 0 1px 3px rgba(20, 45, 32, 0.08)
Menú:   0 8px 24px rgba(20, 45, 32, 0.12)
Modal:  0 16px 40px rgba(20, 45, 32, 0.18)
```

Una pantalla no debe depender de sombras para separar todas sus áreas; primero deben utilizarse espacio, fondo y bordes.

## 8. Diseño del sidebar

- Ancho expandido aproximado: `256 px`.
- Ancho colapsado aproximado: `72 px`.
- Fondo verde principal y texto claro.
- Parte superior reservada para logotipo y nombre de ECOFARM.
- Navegación agrupada según las áreas funcionales previstas.
- Icono y texto para cada opción; en modo colapsado deben existir ayudas visibles al pasar el cursor o al recibir foco.
- Sección activa identificada mediante fondo contrastante, indicador lateral y texto; no únicamente mediante color.
- Submenús con jerarquía clara y expansión controlada.
- Administración separada visualmente de las operaciones frecuentes.
- Cerrar sesión ubicado al final, separado de la navegación, sin tratarlo visualmente como una acción destructiva.

La visibilidad de opciones dependerá de permisos, pero ocultar una opción nunca sustituirá la autorización del backend.

## 9. Diseño del header

- Altura aproximada: `64 px`.
- Fondo blanco con borde inferior sutil.
- Contendrá el control para colapsar la navegación, título o contexto de la página y área del usuario.
- Podrá incluir accesos rápidos o notificaciones únicamente cuando tengan una función real.
- El nombre del usuario y su rol deberán mostrarse sin ocupar espacio excesivo.
- El header permanecerá simple; búsquedas específicas deben ubicarse dentro de su módulo.

En pantallas pequeñas contendrá el botón para abrir el sidebar como panel lateral.

## 10. Estilo de tarjetas

- Fondo blanco, borde sutil, radio de `12 px` y sombra discreta opcional.
- Título breve y valor principal claramente diferenciados.
- Indicadores acompañados por contexto, unidad y periodo correspondiente.
- Acciones secundarias ubicadas en la parte superior derecha cuando aplique.
- Estados interactivos solo en tarjetas que realmente puedan abrirse.
- Evitar tarjetas anidadas y grandes espacios vacíos sin propósito.

## 11. Estilo de formularios

- Etiquetas visibles sobre los campos; no utilizar el `placeholder` como sustituto de la etiqueta.
- Altura mínima recomendada de controles: `40 px`; `44 px` en operaciones táctiles frecuentes.
- Campos obligatorios identificados de manera consistente y explicados al inicio del formulario.
- Texto de ayuda breve debajo del campo cuando sea necesario.
- Mensajes de validación cercanos al campo, con texto e indicador visual.
- Foco visible mediante borde y anillo verde, sin eliminar el indicador del navegador sin reemplazo accesible.
- Secciones largas agrupadas mediante títulos y espacio, no con exceso de recuadros.
- Datos relacionados, como NIT y cliente, deben mostrar claramente el resultado de búsqueda o autocompletado.
- Las acciones principales se mantendrán en una posición predecible.

## 12. Estilo de tablas

- Encabezado claro, texto alineado y separación horizontal discreta.
- Altura aproximada de fila: entre `48` y `56 px`.
- Texto a la izquierda; importes y cantidades alineados a la derecha.
- Estados representados mediante etiquetas con texto.
- Búsqueda y filtros encima de la tabla, mostrando cuáles están activos.
- Acciones frecuentes visibles y acciones secundarias dentro de un menú claramente etiquetado.
- Encabezado fijo cuando la tabla sea extensa y el contexto lo requiera.
- Paginación con total de registros e intervalo visible.
- Estados vacíos, de carga y error explícitos.
- En móvil se priorizarán columnas esenciales; el resto podrá presentarse en detalle expandible o vista de tarjeta.

Las filas no deben depender solamente del doble clic ni de acciones visibles únicamente al pasar el cursor.

## 13. Estilo de botones

Tipos iniciales:

- **Primario:** fondo verde oscuro, texto blanco. Para la acción principal de una sección.
- **Secundario:** fondo blanco, borde gris o verde, texto oscuro. Para acciones alternativas.
- **Terciario:** apariencia de texto, sin competir con la acción principal.
- **Destructivo:** fondo o texto rojo. Exclusivo para eliminar, cancelar o anular.

Reglas:

- Altura mínima: `40 px`; versión compacta solo en tablas densas.
- Radio: `8 px`.
- Etiquetas con verbos claros: “Guardar cotización”, “Emitir venta” o “Anular venta”.
- Mostrar estados de foco, cursor, presionado, carga y deshabilitado.
- Durante el envío, evitar operaciones duplicadas e indicar progreso.
- Utilizar como máximo una acción primaria dominante por área de decisión.
- Los iconos no deben reemplazar texto cuando su significado pueda ser ambiguo.

## 14. Estados visuales

Cada estado deberá combinar color con texto y, cuando ayude, un icono:

- **Éxito:** verde; por ejemplo, activo, disponible, confirmado o completado.
- **Advertencia:** naranja; por ejemplo, stock bajo, vencimiento cercano o información pendiente.
- **Error:** rojo; por ejemplo, fallo de validación o de procesamiento.
- **Inactivo o neutral:** gris; por ejemplo, deshabilitado o archivado.
- **En proceso:** indicador de progreso acompañado por texto.

Los mensajes generales deben explicar qué ocurrió y qué puede hacer el usuario. No deben desaparecer antes de que puedan leerse. Las confirmaciones destructivas deben nombrar la operación afectada y sus consecuencias.

## 15. Diseño conceptual del login

En escritorio se propone una distribución aproximada de `45/55`:

- **Área izquierda:** identidad ECOFARM, mensaje breve y recurso agrícola o abstracto sobrio. Puede utilizar fondo verde oscuro o crema claro según el recurso definitivo.
- **Área derecha:** formulario centrado dentro de un ancho máximo cercano a `420 px`, con correo o usuario, contraseña, mostrar contraseña, recuperación y botón de inicio.

El formulario debe mantener etiquetas visibles, mensajes de error discretos y foco inicial coherente. La opción de mostrar contraseña debe ser accesible y no alterar el contenido del campo. En móvil se priorizará el formulario y el elemento visual se reducirá o simplificará.

## 16. Diseño conceptual del dashboard

El dashboard será un resumen operativo, no una colección decorativa de gráficos. Su contenido deberá adaptarse a los permisos del usuario.

Orden conceptual:

1. Título, periodo consultado y acción contextual si corresponde.
2. Indicadores esenciales en tarjetas, como ventas del periodo, stock bajo y cotizaciones pendientes.
3. Actividad reciente o ventas recientes.
4. Alertas accionables de inventario y operaciones pendientes.
5. Gráficos simples solo cuando permitan comparar o tomar decisiones.

Cada indicador debe explicar su periodo y permitir acceder al detalle cuando exista una vista autorizada.

## 17. Diseño conceptual del POS

El POS será desktop-first y priorizará velocidad, lectura de importes y operación con teclado. Se propone dividirlo en tres áreas:

- **Datos de operación:** NIT, cliente, dirección y estado de la venta.
- **Selección y detalle:** búsqueda por nombre o código, cantidad, stock disponible y lista de productos agregados.
- **Resumen y cobro:** subtotal, descuentos cuando correspondan, total y acciones finales.

Consideraciones:

- La búsqueda de productos será prominente y mantendrá el foco durante operaciones repetitivas.
- La cantidad podrá ingresarse con teclado físico y con teclado numérico visual cuando resulte útil.
- Stock, precio y unidad deben aparecer antes de agregar el producto.
- La tabla de detalle mostrará producto, cantidad, precio, subtotal y eliminación claramente identificada.
- El total tendrá mayor jerarquía visual y números tabulares.
- Guardar, emitir y cancelar o anular deben diferenciarse por texto, posición y color.
- Anular no debe confundirse con limpiar un formulario todavía no emitido.
- Las advertencias de stock deben aparecer cerca del producto afectado.
- Deben definirse atajos de teclado posteriormente y mostrarse sin interferir con la operación táctil.

## 18. Diseño conceptual de cotizaciones

La pantalla seguirá una estructura cercana al flujo de ventas, pero mantendrá claramente su condición de cotización y no de salida de inventario.

- Encabezado con número, estado, fecha y vencimiento.
- Sección de cliente con NIT y dirección.
- Búsqueda y detalle de productos con cantidad, precio y total.
- Área de observaciones con espacio suficiente, sin dominar la pantalla.
- Resumen de importes y estado siempre identificables.
- Acciones: guardar borrador, actualizar, generar PDF y convertir en venta cuando corresponda.
- La conversión en venta debe explicar que iniciará el flujo de confirmación y validación de inventario.
- Los estados deben mostrarse mediante texto y etiqueta visual consistente.

## 19. Diseño conceptual de inventario

El módulo debe separar claramente existencias actuales de historial de movimientos.

- Resumen inicial con productos con stock bajo y alertas accionables.
- Tabla de existencias con producto, código, categoría, cantidad, stock mínimo y estado.
- Filtros por categoría, estado y nivel de existencias.
- Historial con tipo de movimiento, cantidad, fecha, responsable, motivo y referencia.
- Entradas, salidas y ajustes con formularios diferenciados y explicación del efecto sobre el stock.
- Los ajustes y correcciones autorizadas deben requerir motivo visible.
- Cantidades positivas y negativas deben incluir signo, texto o tipo de movimiento; no depender solo de verde y rojo.
- La disponibilidad actual debe distinguirse de los movimientos históricos.

## 20. Reglas responsive

- **Escritorio (`>= 1200 px`):** sidebar expandido, contenido amplio y POS en varias columnas.
- **Escritorio pequeño o tablet horizontal (`768–1199 px`):** sidebar colapsado o ajustable, columnas reducidas y paneles reorganizables.
- **Tablet vertical y móvil (`< 768 px`):** sidebar como panel temporal, contenido en una columna y acciones principales accesibles.
- Los puntos de quiebre son iniciales y deberán validarse con el contenido real, no aplicarse de forma automática.
- No debe existir desplazamiento horizontal general de la página.
- Las tablas complejas podrán priorizar columnas o usar detalle expandible.
- Los diálogos deben ocupar casi todo el ancho disponible en móvil.
- Las áreas táctiles deben medir al menos `44 × 44 px` cuando sea razonable.
- El POS móvil podrá simplificar la distribución, pero no ocultará totales ni acciones críticas.
- La información esencial debe conservarse antes que los elementos decorativos.

## 21. Reglas de consistencia para futuras pantallas

1. Reutilizar la paleta, escala de espacio, tipografía, radios y estados definidos en esta guía.
2. Mantener navegación, títulos y acciones principales en posiciones predecibles.
3. Utilizar los mismos nombres para una misma acción en todo el sistema.
4. No crear variantes visuales de un componente sin una necesidad funcional comprobable.
5. Alinear importes y cantidades a la derecha y utilizar formatos numéricos consistentes.
6. Mostrar fechas, moneda, NIT y números de documento con un formato definido para Guatemala.
7. No utilizar color, iconos o animación como único medio para comunicar información.
8. Mantener foco visible y un orden de navegación por teclado lógico.
9. Incluir estados de carga, vacío, error, éxito y sin permisos cuando correspondan.
10. Diferenciar con claridad crear, guardar borrador, confirmar, cancelar y anular.
11. Solicitar confirmación antes de acciones destructivas o difíciles de revertir.
12. Diseñar según permisos sin asumir que ocultar controles proporciona seguridad.
13. Evitar textos técnicos y presentar mensajes que indiquen cómo resolver el problema.
14. Validar las pantallas de operación frecuente con usuarios reales antes de considerarlas definitivas.
15. Documentar y justificar cualquier cambio importante en estos criterios antes de aplicarlo de forma general.

Esta guía no define todavía componentes, estilos CSS ni una librería visual. Esas decisiones deberán analizarse y autorizarse en tareas posteriores.
