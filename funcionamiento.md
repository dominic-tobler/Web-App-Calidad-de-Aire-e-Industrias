# Funcionamiento de la vista experta

Corre con `npm run dev:expert` → http://localhost:5174. El código está en `src/pages/expert/`.

## Filtros globales (arriba)

- **Datos disponibles** (`domain/periods.ts`): hay dos periodos, ene–may 2024 y ene–may 2025. Las fechas del filtro solo se pueden elegir dentro del periodo activo; una fecha fuera se ajusta al borde. Al cambiar de periodo, los rangos arrancan en el primer día con mediciones (en 2025 los datos empiezan el 23 de enero; en 2024 terminan el 21 de mayo).
- **Rango de fechas** (`ExpertDashboard.tsx`): define la serie de tiempo y qué semanas se pueden elegir en las matrices de correlación. Ya no hay filtro de horas: se usan las 24 horas.
- **Estado de la industria** (dentro de la tarjeta «Industrias seleccionadas», encima de las barras, en una sola fila): Todas (default), Seguimiento / trámite o Sancionadas. Seguimiento y trámite van juntas porque el mapa las dibuja con el mismo símbolo. Filtra las industrias del mapa y decide qué histogramas se muestran. Está en esa tarjeta porque solo afecta a las industrias; así la serie de tiempo sube hasta la fila de la barra de rango y la fila de matrices y barras queda más alta.

## Mapa (`map/ExpertMap.tsx`)

- Leaflet con los municipios de `municipios-cundinamarca.json`. El nombre del municipio bajo el cursor aparece arriba a la izquierda, debajo de la etiqueta de la hora del mapa.
- **Recuadro de selección:** con la herramienta activa (botón punteado bajo el zoom; dice en letra pequeña el modo actual, «Desplazar» o «Selección», y al pasar el cursor muestra un tooltip con la ayuda), arrastrar dibuja un recuadro, y un clic sin arrastrar lo borra. Al desactivarla, el mapa se puede mover. El recuadro inicial está sobre la Sabana Occidente (`INITIAL_SELECTION`).
- **Estaciones:**
  - El relleno es el nivel de calidad del aire del valor registrado en la **hora del mapa**, para todas las estaciones (no solo las del recuadro).
  - Hora del mapa por defecto: 12:00 hora de Colombia (COT, UTC−5) del primer día del rango. Pasar el cursor por la serie de tiempo la cambia mientras dura el hover, y un clic la fija; la etiqueta arriba a la izquierda dice la hora y cuántas estaciones tienen dato.
  - El color es el nivel ICA de la Tabla No. 2 del DANE (`domain/icaLevels.ts`): Buena, Moderada, Dañina para grupos sensibles, Dañina, Muy dañina y Peligrosa. La leyenda del mapa muestra los 6 colores.
  - Gris = valor sin categoría ICA (NO₂ por debajo de 1.223 µg/m³); blanco = sin dato a esa hora.
  - Las estaciones dentro del recuadro llevan un anillo del mismo color que su línea en la serie.
- **Industrias:** misma convención que la vista común (`INDUSTRY_STATUS_STYLE` en `src/layouts/map/industryMarkers.ts`): fábrica oscura sólida = sancionada, fábrica con solo el contorno = seguimiento o trámite. No se usa rojo para no confundirlas con el ICA de las estaciones. Las que quedan fuera del recuadro se atenúan.
- La etiqueta azul cuenta las estaciones y las industrias dentro del recuadro.

## Serie de tiempo (`charts/MovingAverageSeries.tsx`)

- Una línea por estación del recuadro. Sin recuadro se dibujan todas.
- **Media móvil con la ventana de exposición de la Tabla No. 2:** 24 h para PM2.5, PM10 y SO₂; 8 h para O₃ y CO; 1 h para NO₂. Se publica el valor si al menos la mitad de las horas de la ventana tienen dato. Si no, la línea se corta.
- **Fondo = bandas ICA** con los puntos de corte de la Tabla No. 2 (`ICA_CUTS` en `domain/icaLevels.ts`). Los gases (O₃, CO, SO₂, NO₂) vienen en ppm en la tabla y se pasan a µg/m³ a 25 °C y 1 atm. El eje muestra los datos y al menos la banda Buena completa. NO₂ solo tiene cortes desde «Muy dañina» (nota 2 de la tabla), así que con valores bajos no se dibujan bandas y aparece una nota. En O₃, «Peligrosa» usa el corte de 1 h (nota 3).
- El selector **Variable** solo trae contaminantes (PM2.5, PM10, O₃, NO₂, SO₂, CO) y cambia la serie y el color del mapa.
- **Clic en la serie:** fija la hora del mapa (línea azul «Mapa · dd/mm hh:00»). El botón «Volver al mediodía del primer día» la restablece, y cambiar las fechas también.
- **Cursor sobre la serie:** el mapa (relleno de estaciones, etiqueta, tooltip y encabezado) muestra la hora bajo el cursor, y el tooltip de la serie da el valor de cada estación. Al sacar el cursor, el mapa vuelve a la hora fijada.

## Matrices de correlación (`charts/CorrelationMatrix.tsx`)

- Son dos matrices lado a lado con las mismas filas y columnas: **Sin lluvia** (izquierda) y **Con lluvia** (derecha). Comparten la leyenda de −1 a 1.
- **Filtro de tiempo:** solo por semana, de lunes a domingo (`weeksCovering` en `domain/periods.ts`). El selector muestra solo las semanas con al menos un día dentro del rango de fechas del mapa. Ejemplo: del 5 al 21 de febrero de 2024 aparecen las semanas 05/02–11/02, 12/02–18/02 y 19/02–25/02.
- Cada semana se calcula **completa**, aunque tenga días antes o después del rango del mapa. Cuando pasa, el aviso junto al selector lo dice. Si se cambia el rango y la semana elegida ya no lo toca, se usa la primera semana disponible.
- Para cada hora promedia las estaciones del recuadro. Una hora es «con lluvia» si el promedio de precipitación (RAIN) de las estaciones del recuadro con dato es mayor que 0 mm, y «sin lluvia» en otro caso. Las horas sin dato de RAIN (estaciones que no la miden o fallas de medición) cuentan como sin lluvia, para no perder las demás variables de esas horas.
- Pearson entre 8 variables: PM2.5, PM10, O₃, NO₂, SO₂, CO, temperatura y velocidad del viento (`CORRELATION_VARIABLES` en `domain/variables.ts`). Ya no entran la dirección del viento ni la precipitación, que es la que separa las matrices.
- El título de cada matriz dice cuántas horas usa. La celda queda gris con «—» si hay menos de 12 horas en común (`MIN_CORRELATION_PAIRS`). El umbral es bajo porque una semana tiene pocas horas con lluvia.
- Si ninguna estación del recuadro mide precipitación, todas las horas van a «Sin lluvia» y el panel «Con lluvia» muestra un aviso. También hay aviso si en la semana no hubo horas con o sin lluvia.
- Escala roja (+1) → blanca (0) → azul (−1). El tooltip muestra la matriz, r y el número de horas usadas.
- Cálculo en `correlationByRain` de `data/measurements.ts`.

## Industrias seleccionadas (`charts/CategoryBars.tsx`)

- Cuenta las industrias del estado elegido dentro del recuadro. La tarjeta de las matrices mide lo que necesitan las dos matrices según la altura disponible (`onContentWidth`); recibe el 90 % de ese ancho (`MATRIX_WIDTH_SHARE`) y las barras se quedan con el resto de la fila, con un mínimo de 360 px.
- **Todas:** una barra por estado (seguimiento, trámite, sancionada).
- **Seguimiento / trámite:** barras de tipo de fuente de emisión (categorías de `sourceCategory`) y de tipo de combustible. Las categorías de combustible por encima de 4 se agrupan en «Resto»; el tooltip dice cuáles son.
- **Sancionadas:** barras de razón de sanción por código (R1–R3), con un cuadro debajo que trae, en una línea por código, «R#: texto completo» y su conteo. El tooltip de una industria sancionada en el mapa solo dice «Código de sanción: R#».
- Los códigos salen de la columna `ClassCode` de `Data/industries.json`, creada en `Preprocessing/industry_cleaning.ipynb`.

## Datos (`data/measurements.ts`)

- `Data/datos_24_25.csv` se carga una vez al abrir la página, del 1 de enero de 2024 al 27 de mayo de 2025. El archivo trae horas UTC; la vista las muestra en hora de Colombia (COT, UTC−5, sin horario de verano).
- Los valores ≥ 9000 se toman como faltantes, igual que en la vista común.
- PM2.5 y PM10 exactamente iguales a 985 µg/m³ (3.178 filas, tope del equipo) también se toman como faltantes (`PM_SATURATION`).
- Cada estación y variable se guarda como un arreglo indexado por hora desde el 01/01/2024 00:00 UTC. Los días del filtro y las etiquetas usan el día civil de Colombia: la medianoche local es las 05:00 UTC.
- **Hora de referencia única:** todas las gráficas de las dos vistas (mapa, serie, matrices, rosas de viento, calendario y tendencia horaria de la vista común) usan la hora de Colombia (COT, UTC−5). El desfase está en un solo lugar, `COLOMBIA_OFFSET_HOURS` en `src/domain/time.ts`. La vista común convierte cada fila al leerla (`colombiaFromUtc`) y la experta al mostrar o filtrar (`hourOfDay`, `hourToDate`, `dayStartHour`).

## Pendientes conocidos

- Si se suelta el mouse fuera del mapa, el recuadro no se confirma.

## Rosas de viento (`src/pages/expert/windrose/`)

- El botón arriba a la derecha (`ExpertShell.tsx`) cambia entre «Serie y correlación» (la vista experta de siempre, sin cambios) y «Rosas de viento». Las dos quedan montadas y conservan sus filtros.
- **Filtro de tiempo:** solo el mes (ene–may de 2024 y 2025). Cada cálculo usa todas las horas del mes en hora local (UTC−5).
- **Mapa:** solo aparecen las estaciones con algún dato de viento (WDD). Un clic elige una estación; las que no tienen viento en el mes salen tenues. El color es el nivel ICA de la media mensual del contaminante del abanico.
- **Rosas 2×2:** filas PM2.5 y PM10, columnas día (06:00–17:59) y noche (18:00–05:59). 16 direcciones; el largo del pétalo es el % de horas con viento desde esa dirección, apilado por nivel ICA de cada hora. Las 4 rosas comparten escala. Centro = % de calma (viento < 0,5 m/s; si falta la velocidad, la hora no cuenta como calma). Aviso si n < 48 h.
- **Abanico:** las 3 direcciones con más carga del contaminante (suma de concentraciones = frecuencia × concentración), día y noche juntos, con radio de 15 km. Las industrias dentro del abanico se resaltan y se listan como «viento arriba». Si la estación no mide el PM elegido, el abanico usa el otro.
- Cálculos en `windRose.ts`; no modifica los datos ni `measurements.ts`.
