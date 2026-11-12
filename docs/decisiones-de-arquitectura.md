# Decisiones de arquitectura

Dashboards de calidad del aire e industrias en Cundinamarca. Las decisiones salen de los frames de Figma (páginas *Diseño usuario común* `0:1` y *Diseño usuario experto* `61:2`) y del estado actual del repositorio: Vite, React 19, TypeScript y D3, con `Data/industries.json` (536 industrias geocodificadas) como único dato de aplicación.

## 1. Dos audiencias, un solo producto

El archivo de Figma define dos páginas, no dos aplicaciones.

- **Usuario común** mira una hora concreta y explora la relación entre estaciones e industrias.
- **Usuario experto** mira un rango de fechas y horas, selecciona con un recuadro sobre el mapa y compara series, meteorología y cobertura.

Comparten mapa, filtros de fuente de emisión y contaminante, escala de calidad del aire y el modelo de industrias y estaciones. Cambian el recorte temporal y los gráficos de la derecha.

## 2. Los frames repetidos son modos, no pantallas nuevas

En el usuario común hay cinco frames. Se implementan así:

| Frame | Tratamiento |
| :--- | :--- |
| Exploración (`1:2`) | Vista base: mapa, controles de año/mes/día/hora y filtros |
| Análisis (`27:2`) | Vista de análisis con dispersión y ranking |
| Mapa ampliado (`71:56`) | Mismo análisis, con el mapa ocupando el panel derecho |
| Cercanía (`73:2`) | Modo del panel de análisis: grupos a menos de 5 km |
| Enlaces (`76:2`) | Modo del panel de análisis: líneas de proximidad |

La pregunta de los tres últimos modos es la misma: qué tan cerca está una estación de una industria. El panel derecho cambia de codificación (dispersión, grupos o enlaces). El mapa ampliado es un booleano de layout.

En el usuario experto hay cuatro frames y un shell fijo: mapa, rango temporal, filtros y recuadro de selección. Solo rotan los gráficos:

| Vista | Frame | Gráficos |
| :--- | :--- | :--- |
| Series | `61:3` | Media móvil multiestación y barras apiladas de PM2.5 / PM10 |
| Contexto | `61:304` | Matriz meteorológica, barras de fuente y combustible, serie con variable elegible |
| Cuándo y origen | `89:2` | Perfil horario, rosa de vientos y calendario día × hora |
| Cobertura | `90:2` | Heatmap estación × contaminante, razón PM2.5/PM10 y cobertura horaria |

## 3. React arma la interfaz; D3 dibuja los gráficos

Se mantiene la decisión del README: D3 imperativo con `useRef`.

- React renderiza el shell, los filtros, las leyendas, los rankings y el detalle de una estación.
- D3 calcula escalas, ejes, trazos, zoom y brush, y actualiza el SVG del mapa y de cada gráfico.
- Las cuentas no viven en los componentes. Vecino más cercano, perfiles horarios, correlaciones, porcentajes por banda y cobertura son funciones puras en la capa de datos. Los gráficos reciben arreglos ya reducidos.

`src/App.tsx` y `src/ScatterPlot.tsx` son la plantilla de Vite. No se extienden para los dashboards.

## 4. Un estado compartido

Audiencia y vista viven en un contexto de React. No se agrega un router en la primera versión: con el estado basta para recorrer los frames.

Contrato:

- **Tiempo.** Instante (`año`, `mes`, `día`, `hora`) en el usuario común. Rango de fechas y rango de horas en el experto.
- **Filtros.** Contaminante (`ICA`, `NO2`, `NOx`, `PM2.5`, `PM10`, `SO2`), tipo de fuente y combustible. Todos admiten el valor «todos».
- **Selección.** Identificadores de estaciones e industrias, recuadro del mapa y estación enfocada.
- **Vista.** Audiencia, modo de análisis (`dispersión`, `grupos`, `enlaces`) y si el mapa está ampliado.

El tiempo y los filtros son la consulta global. En el experto, el recuadro define qué estaciones e industrias alimentan la matriz, las barras, la serie y la rosa de vientos. Un clic en una estación enfoca el detalle y resalta su línea. En el común, el calendario cambia el día y la tendencia horaria marca la hora que colorea el mapa.

## 5. El mapa sale de GeoJSON, no de los vectores de Figma

Los municipios están dibujados en Figma como vectores sueltos. Esa geometría no se usa como fuente del mapa.

El mapa es un componente `CundinamarcaMap`:

- Base: GeoJSON de municipios de Cundinamarca proyectado con `d3.geoMercator` y ajustado al SVG.
- Capas independientes: municipios, estaciones (círculos), industrias (símbolos por estado), brush y enlaces de proximidad.
- Zoom y desplazamiento con `d3.zoom`, equivalentes a los controles del frame.

Así las coordenadas de `industries.json` y de las estaciones caen en el lugar correcto.

## 6. Una sola escala de calidad del aire

Las bandas *Bajo*, *Moderado*, *Alto*, *Muy alto* y *Peligroso* se definen una vez, con umbral por contaminante. El mapa, el calendario y las series consumen ese módulo. Ningún gráfico hardcodea colores ni cortes.

Los textos del diseño se normalizan en la interfaz: «Index de calidad del aire» pasa a «Índice de calidad del aire» y «PM2» a «PM2.5».

## 7. Datos estáticos, sin backend

No hay servidor de API. El notebook de `Preprocessing/` limpia y el resultado queda en `Data/` como JSON que Vite sirve.

- `industries.json` ya existe.
- `stations.json` describe cada estación: identificador, nombre, municipio, longitud y latitud.
- Las observaciones horarias se parten por mes (`observations/2024-01.json` y siguientes) y se cargan según el rango visible.
- La meteorología viaja junto a la hora de la estación o en un archivo paralelo con la misma clave temporal.

536 industrias por unas decenas de estaciones se resuelven con distancia de haversine al cargar. No se agrega un índice espacial ni DuckDB en esta etapa. Si un mes de observaciones se vuelve pesado para el navegador, el siguiente paso es preagregar en el notebook, no montar un backend.

## 8. Normalizar industrias antes de pintarlas

| Campo en el JSON | Decisión |
| :--- | :--- |
| `Estado` | `Sancionatorio` se muestra como «Sancionada». `Seguimiento y Control` se muestra como «Seguimiento». |
| `En Trámite` | No tiene símbolo en Figma. Se omite del mapa hasta que el diseño defina un tercer símbolo. El registro se conserva en los datos. |
| `TipoFuenteEmision` | Hay 30 textos crudos. El filtro y las barras usan una taxonomía corta: caldera, horno, secador, planta de asfalto y otro. El nombre original queda en el tooltip. |
| `TipoCombustible` | Se usa tal cual en las barras del experto, con el valor vacío tratado como «sin dato». |
| `Class` | Motivo de la sanción. Solo aparece en el detalle, no como codificación visual principal. |

## 9. Estructura de carpetas

```text
src/app       shell, título y cambio de audiencia y vista
src/state     contexto de tiempo, filtros y selección
src/domain    tipos, taxonomía de fuentes y umbrales de calidad
src/data      carga de JSON y consultas puras
src/map       mapa y overlays
src/charts    un componente por gráfico, D3 imperativo
src/ui        filtros, calendarios, leyendas y rankings
Data/         JSON derivados; el notebook sigue siendo la limpieza
```

Piezas que se construyen una sola vez: `CundinamarcaMap`, `airQualityScale`, `EmissionFilters`, `TimeControls`, `PollutionCalendar`, `MultiSeriesChart` y `StationDetail`.

## 10. Orden de implementación

1. Mapa de municipios con las 536 industrias y símbolo según estado.
2. Shell común: filtros de fuente y contaminante, y leyenda.
3. Capa de estaciones y consulta por hora. Depende de `stations.json` y de las observaciones.
4. Vista de análisis con los tres modos del panel derecho. Depende de la distancia a la industria más cercana.
5. Shell experto: rango temporal y brush, sobre la misma consulta.
6. Series, contexto meteorológico, calendario día × hora y cobertura. Depende de meteorología y de horas completas, incluido el dato faltante.

Los pasos 3 y 6 no pueden cerrarse con el repositorio actual: no hay estaciones, ni series horarias, ni meteorología. El primer entregable realista es el mapa de industrias.

## Fuera de alcance por ahora

- Router y URLs compartibles.
- Backend o base de datos en vivo.
- Índice espacial.
- Copiar posición absoluta desde Figma. El layout del shell es CSS; el SVG de cada gráfico lo calcula D3.
