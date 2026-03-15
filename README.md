# Armoniógrafo epicicloidal

Aplicación web estática para explorar un armoniógrafo epicicloidal con dos engranajes fijos, dos engranajes móviles y un lápiz definido por la intersección superior de dos brazos.

No necesita build ni dependencias. Todo funciona con `HTML`, `CSS` y `JavaScript` plano.

## Modelo

- `O1` y `O1'` son engranajes fijos definidos por número de dientes.
- `O2` y `O2'` son engranajes móviles definidos también por número de dientes.
- El radio de cada engranaje se deriva como `radio = modulo * dientes`.
- Las ruedas móviles ruedan exteriormente sobre las fijas sin derrape.
- La velocidad geométrica se define con una `velocidad base común`.
- El sentido de giro común puede invertirse.
- Los puntos rojos sobre `O2` y `O2'` generan trayectorias epicicloidales.
- El lápiz es la intersección superior de los dos brazos.

## Controles principales

- `Distancia Zero`
- número de dientes de `O1` y `O1'`
- número de dientes de `O2` y `O2'`
- `Módulo de diente`
- `Velocidad base común`
- `Invertir sentido común`
- `Fase angular inicial izquierda`
- `Fase angular inicial derecha`
- `Brazo 1` y `Brazo 2`
- `Duración visual del ciclo`
- `Velocidad visual`

La interfaz incluye casillas para igualar pares izquierda-derecha cuando se quiera trabajar con configuraciones simétricas.

## Restricciones geométricas

La configuración se considera válida cuando se cumplen al menos estas condiciones base:

- `Distancia Zero > R1 + R1' + R2 + R2'`
- `distZeromin = Distancia Zero - R1 - R1'`
- `distZeromin > R2 + R2'`

La interfaz muestra además información orientativa adicional, como margen de brazos, ciclo geométrico y recetario de ajuste.

## Trazado y rendimiento

- El trazo del lápiz es persistente.
- El dibujo usa una capa interna acumulativa para evitar redibujar toda la curva en cada frame.
- Hay compactación controlada de puntos para evitar degradación progresiva del rendimiento en sesiones largas.
- La velocidad visual está desacoplada de la velocidad geométrica para evitar cambios bruscos de animación al modificar la rotación.

## Importación y exportación

Se puede guardar y recuperar una configuración completa mediante JSON:

- `Exportar params`: exporta `model`, `syncState` y color de trazo.
- `Importar params`: carga una configuración exportada previamente.
- `Preset`: descubre automáticamente los JSON dentro de `presets/`, los agrupa por tipo (`base_`, `arq_`, `orn_`) y carga la configuración elegida.

También se puede exportar el trazo actual como `SVG`.

## Vista

La interfaz incluye:

- `Start`, `Stop`, `Reinicio`, `Borrar trazo`, `Guardar`
- `Exportar params`, `Importar params`
- selector de color del trazo
- `Centrar vista`, `Zoom +`, `Zoom -`, `Reset vista`

## Ejecución local

Puedes utilizar la extensión Live Server si estás en Visual Studio Code. Despues abre `http://localhost:3000`

También puedes levantar (si tienes python 3 instalado) un servidor local:

```bash
python3 -m http.server 8088
```

Después abre `http://localhost:8088`.

El selector de presets necesita abrir la app a través de HTTP para poder leer dinámicamente el contenido de `presets/`.

## Archivos

- `index.html`: interfaz y controles
- `app.js`: modelo geométrico, validación, animación, trazo y exportación
- `styles.css`: disposición visual
