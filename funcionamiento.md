# Funcionamiento de la vista experta

Corre con `npm run dev:expert` → http://localhost:5174. El código está en `src/pages/expert/`.

## Filtros globales (arriba)

- **Datos disponibles** (`domain/periods.ts`): hay dos periodos, ene–may 2024 y ene–may 2025. Las fechas del filtro y de la matriz solo se pueden elegir dentro del periodo activo; una fecha fuera se ajusta al borde. Al cambiar de periodo, los rangos arrancan en el primer día con mediciones (en 2025 los datos empiezan el 23 de enero; en 2024 terminan el 21 de mayo).
- **Rango de fechas** (`ExpertDashboard.tsx`): define la serie de tiempo. Ya no hay filtro de horas: se usan las 24 horas.
- **Industrias en el mapa:** Todas (default), En seguimiento, En trámite o Sancionadas. Filtra las estrellas del mapa y decide qué histogramas se muestran.

## Mapa (`map/ExpertMap.tsx`)

- Leaflet con los municipios de `municipios-cundinamarca.json`.
- **Recuadro de selección:** con la herramienta activa (botón punteado bajo el zoom), arrastrar dibuja un recuadro, y un clic sin arrastrar lo borra. Al desactivarla, el mapa se puede mover. El recuadro inicial está sobre la Sabana Occidente (`INITIAL_SELECTION`).
- **Estaciones:**
  - El relleno es el nivel de calidad del aire del valor registrado en la **hora del mapa**, para todas las estaciones (no solo las del recuadro).
  - Hora del mapa por defecto: 12:00 hora de Colombia (COT, UTC−5) del primer día del rango. Un clic en la serie de tiempo la cambia; la etiqueta arriba a la izquierda dice la hora y cuántas estaciones tienen dato.
  - El color es el nivel ICA de la Tabla No. 2 del DANE (`domain/icaLevels.ts`): Buena, Moderada, Dañina para grupos sensibles, Dañina, Muy dañina y Peligrosa. La leyenda del mapa muestra los 6 colores.
  - Gris = valor sin categoría ICA (NO₂ por debajo de 1.223 µg/m³); blanco = sin dato a esa hora.
  - Las estaciones dentro del recuadro llevan un anillo del mismo color que su línea en la serie.
- **Industrias:** misma convención que la vista común (`src/layouts/map/industryMarkers.ts`): estrella roja = sancionada, estrella oscura = seguimiento o trámite. Las que quedan fuera del recuadro se atenúan.
- La etiqueta azul cuenta las estaciones y las industrias dentro del recuadro.

## Serie de tiempo (`charts/MovingAverageSeries.tsx`)

- Una línea por estación del recuadro. Sin recuadro se dibujan todas.
- **Media móvil con la ventana de exposición de la Tabla No. 2:** 24 h para PM2.5, PM10 y SO₂; 8 h para O₃ y CO; 1 h para NO₂. Se publica el valor si al menos la mitad de las horas de la ventana tienen dato. Si no, la línea se corta.
- **Fondo = bandas ICA** con los puntos de corte de la Tabla No. 2 (`ICA_CUTS` en `domain/icaLevels.ts`). Los gases (O₃, CO, SO₂, NO₂) vienen en ppm en la tabla y se pasan a µg/m³ a 25 °C y 1 atm. El eje muestra los datos y al menos la banda Buena completa. NO₂ solo tiene cortes desde «Muy dañina» (nota 2 de la tabla), así que con valores bajos no se dibujan bandas y aparece una nota. En O₃, «Peligrosa» usa el corte de 1 h (nota 3).
- El selector **Variable** solo trae contaminantes (PM2.5, PM10, O₃, NO₂, SO₂, CO) y cambia la serie y el color del mapa.
- **Clic en la serie:** fija la hora del mapa (línea azul «Mapa · dd/mm hh:00»). El botón «Volver al mediodía del primer día» la restablece, y cambiar las fechas también.
- **Bandas Bajo → Peligroso:** solo existen para PM2.5, PM10, NO₂ y SO₂ (cortes en `THRESHOLDS` de `domain/airQuality.ts`).
- Al pasar el cursor se ven los valores de cada estación en esa hora.

## Matriz de correlación (`charts/CorrelationMatrix.tsx`)

- Tiene su propio periodo, con un mínimo de 5 días. Con menos muestra un aviso y no calcula.
- Para cada hora promedia las estaciones del recuadro. Luego calcula Pearson entre 9 variables (sin dirección del viento, `CORRELATION_VARIABLES` en `domain/variables.ts`) con las horas en que ambas tienen dato.
- La celda queda gris con «—» si hay menos de 24 horas en común.
- Escala roja (+1) → blanca (0) → azul (−1). El tooltip muestra r y el número de horas usadas.
- Cálculo en `correlationMatrix` de `data/measurements.ts`.

## Industrias seleccionadas (`charts/CategoryBars.tsx`)

- Cuenta las industrias del estado elegido dentro del recuadro.
- **Todas:** una barra por estado (seguimiento, trámite, sancionada).
- **Seguimiento / trámite:** barras de tipo de fuente de emisión (categorías de `sourceCategory`) y de tipo de combustible. Las categorías de combustible por encima de 4 se agrupan en «Resto»; el tooltip dice cuáles son.
- **Sancionadas:** barras de razón de sanción por código (R1–R3), con un cuadro al lado que trae el texto completo de cada código y su conteo.
- Los códigos salen de la columna `ClassCode` de `Data/industries.json`, creada en `Preprocessing/industry_cleaning.ipynb`.

## Datos (`data/measurements.ts`)

- `Data/datos_24_25.csv` se carga una vez al abrir la página, del 1 de enero de 2024 al 27 de mayo de 2025. El archivo trae horas UTC; la vista las muestra en hora de Colombia (COT, UTC−5, sin horario de verano).
- Los valores ≥ 9000 se toman como faltantes, igual que en la vista común.
- PM2.5 y PM10 exactamente iguales a 985 µg/m³ (3.178 filas, tope del equipo) también se toman como faltantes (`PM_SATURATION`).
- Cada estación y variable se guarda como un arreglo indexado por hora desde el 01/01/2024 00:00 UTC. Los días del filtro y las etiquetas usan el día civil de Colombia: la medianoche local es las 05:00 UTC.

## Pendientes conocidos

- La vista común todavía usa su escala anterior de 5 niveles (`src/domain/airQuality.ts`), no la del ICA.
- Si se suelta el mouse fuera del mapa, el recuadro no se confirma.

## Rosas de viento (`src/pages/expert/windrose/`)

- El botón arriba a la derecha (`ExpertShell.tsx`) cambia entre «Serie y correlación» (la vista experta de siempre, sin cambios) y «Rosas de viento». Las dos quedan montadas y conservan sus filtros.
- **Filtro de tiempo:** solo el mes (ene–may de 2024 y 2025). Cada cálculo usa todas las horas del mes en hora local (UTC−5).
- **Mapa:** solo aparecen las estaciones con algún dato de viento (WDD). Un clic elige una estación; las que no tienen viento en el mes salen tenues. El color es el nivel ICA de la media mensual del contaminante del abanico.
- **Rosas 2×2:** filas PM2.5 y PM10, columnas día (06:00–17:59) y noche (18:00–05:59). 16 direcciones; el largo del pétalo es el % de horas con viento desde esa dirección, apilado por nivel ICA de cada hora. Las 4 rosas comparten escala. Centro = % de calma (viento < 0,5 m/s; si falta la velocidad, la hora no cuenta como calma). Aviso si n < 48 h.
- **Abanico:** las 3 direcciones con más carga del contaminante (suma de concentraciones = frecuencia × concentración), día y noche juntos, con radio de 15 km. Las industrias dentro del abanico se resaltan y se listan como «viento arriba». Si la estación no mide el PM elegido, el abanico usa el otro.
- Cálculos en `windRose.ts`; no modifica los datos ni `measurements.ts`.
