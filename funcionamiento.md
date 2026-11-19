# Funcionamiento de la vista experta

Corre con `npm run dev:expert` → http://localhost:5174. El código está en `src/expert/`.

## Filtros globales (arriba)

- **Rango de fechas y horas** (`ExpertDashboard.tsx`): define el periodo de la serie de tiempo y del color de las estaciones en el mapa. La franja de horas puede cruzar la medianoche (p. ej. 20:00–05:00). No afecta la matriz de correlación.
- **Estado de las industrias**: una sola opción (seguimiento, trámite o sancionadas). Filtra las estrellas del mapa y decide qué histogramas se muestran.

## Mapa (`map/ExpertMap.tsx`)

- Leaflet con los municipios de `municipios-cundinamarca.json`.
- **Recuadro de selección:** con la herramienta activa (botón punteado bajo el zoom), arrastrar dibuja un recuadro, y un clic sin arrastrar lo borra. Al desactivarla, el mapa se puede mover. El recuadro inicial está sobre la Sabana Occidente (`INITIAL_SELECTION`).
- **Estaciones:**
  - El relleno es el nivel de calidad del aire de la media del periodo para la variable elegida.
  - Si la variable no tiene bandas, el relleno es gris; si no hay datos, es blanco.
  - Las estaciones dentro del recuadro llevan un anillo del mismo color que su línea en la serie.
- **Industrias:** misma convención que la vista común (`src/map/industryMarkers.ts`): estrella roja = sancionada, estrella oscura = seguimiento o trámite. Las que quedan fuera del recuadro se atenúan.
- La etiqueta azul cuenta las estaciones y las industrias dentro del recuadro.

## Serie de tiempo (`charts/MovingAverageSeries.tsx`)

- Una línea por estación del recuadro. Sin recuadro se dibujan todas.
- **Media móvil de 24 h de reloj:** solo cuentan las horas de la franja elegida, y se publica el valor si al menos la mitad de esas horas tienen dato. Si no, la línea se corta.
- El selector **Variable** cambia la serie y el color del mapa.
- **Bandas Bajo → Peligroso:** solo existen para PM2.5, PM10, NO₂ y SO₂ (cortes en `THRESHOLDS` de `domain/airQuality.ts`).
- Al pasar el cursor se ven los valores de cada estación en esa hora.

## Matriz de correlación (`charts/CorrelationMatrix.tsx`)

- Tiene su propio periodo, con un mínimo de 7 días. Con menos muestra un aviso y no calcula.
- Para cada hora promedia las estaciones del recuadro; la dirección del viento se promedia como vector. Luego calcula Pearson entre las 10 variables con las horas en que ambas tienen dato.
- La celda queda gris con «—» si hay menos de 24 horas en común.
- Escala roja (+1) → blanca (0) → azul (−1). El tooltip muestra r y el número de horas usadas.
- Cálculo en `correlationMatrix` de `data/measurements.ts`.

## Industrias seleccionadas (`charts/CategoryBars.tsx`)

- Cuenta las industrias del estado elegido dentro del recuadro.
- **Seguimiento / trámite:** barras de tipo de fuente de emisión (categorías de `sourceCategory`) y de tipo de combustible. Las categorías de combustible por encima de 4 se agrupan en «Resto»; el tooltip dice cuáles son.
- **Sancionadas:** barras de razón de sanción por código (R1–R3), con un cuadro al lado que trae el texto completo de cada código y su conteo.
- Los códigos salen de la columna `ClassCode` de `Data/industries.json`, creada en `Preprocessing/industry_cleaning.ipynb`.

## Datos (`data/measurements.ts`)

- `Data/datos_24_25.csv` se carga una vez al abrir la página, del 1 de enero de 2024 al 27 de mayo de 2025, en horas UTC.
- Los valores ≥ 9000 se toman como faltantes, igual que en la vista común.
- Cada estación y variable se guarda como un arreglo indexado por hora desde el 01/01/2024 00:00 UTC.

## Pendientes conocidos

- O₃ y CO no tienen cortes de calidad del aire (sin bandas ni color en el mapa).
- La correlación de Pearson con la dirección del viento (variable circular) hay que leerla con cuidado.
- Si se suelta el mouse fuera del mapa, el recuadro no se confirma.
