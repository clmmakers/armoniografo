# Simulador web de pantografo

Aplicacion web estatica para visualizar, ajustar y validar un pantografo de 4 accionamientos:

- 2 deslizadores laterales
- 2 rotores
- calculo del punto trazador por interseccion geometrica
- validacion de geometria segura antes de aceptar cambios
- visualizacion del trazo en canvas
- exportacion del dibujo a SVG

El proyecto no necesita build ni dependencias externas. Todo funciona con HTML, CSS y JavaScript plano.

## Objetivo

El simulador representa una maquina con dos lados simetricos:

- cada lado tiene un eje de rotor que se desplaza horizontalmente por una carrera lateral
- desde cada eje sale un brazo biela
- desde los extremos de ambos brazos se calculan dos bielas largas del pantografo
- el punto trazador se obtiene como la interseccion geometrica de esas dos bielas

La aplicacion permite estudiar como cambia la trayectoria al modificar:

- la geometria base de la maquina
- las carreras de los ejes laterales
- las frecuencias y fases de los deslizadores
- las frecuencias y fases de los rotores
- la vista y el color del trazo

## Estructura del proyecto

- `index.html`: estructura de la interfaz
- `app.js`: modelo geometrico, animacion, validaciones, interaccion y exportacion
- `styles.css`: disposicion visual, paneles, canvas y controles

## Ejecucion en local

Desde la raiz del proyecto:

```bash
python3 -m http.server 8088
```

Despues abre:

```text
http://localhost:8088
```

Tambien puede abrirse `index.html` directamente en el navegador, pero se recomienda usar servidor local para evitar problemas de cache y para probar cambios con mas consistencia.

## Recarga del navegador

Si haces cambios en el codigo y no los ves reflejados:

- Windows / Linux: `Ctrl + F5` o `Ctrl + Shift + R`
- macOS: `Cmd + Shift + R`

Si aun asi sigue apareciendo una version antigua:

- abre la pagina en una ventana privada
- o vacia la cache del navegador para ese sitio

## Modelo geometrico

### Variables principales

El bloque `Geometria del pantografo` controla estas magnitudes:

- `Separacion de bases`
  Distancia horizontal entre las dos bases de referencia del sistema.

- `Brazo pantografo izquierdo`
  Longitud de la biela izquierda que une la articulacion izquierda con el punto trazador.

- `Brazo pantografo derecho`
  Longitud de la biela derecha que une la articulacion derecha con el punto trazador.

- `Carrera izquierda`
  Distancia total recorrida por el eje del rotor izquierdo desde su final exterior hacia el centro.

- `Carrera derecha`
  Distancia total recorrida por el eje del rotor derecho desde su final exterior hacia el centro.

- `Brazo biela izquierda`
  Distancia entre el eje del rotor izquierdo y la articulacion extrema izquierda.

- `Brazo biela derecha`
  Distancia entre el eje del rotor derecho y la articulacion extrema derecha.

### Variables cinematicas

Cada deslizador lateral tiene:

- `Frecuencia (Hz)`
- `Fase (rad)`

Cada rotor tiene:

- `Frecuencia (Hz)`
- `Fase (rad)`

En los rotores:

- frecuencia negativa = giro en un sentido
- frecuencia positiva = giro en el sentido contrario
- frecuencia cero = rotor parado

Los sliders de frecuencia de rotor estan centrados en `0` para facilitar el cambio de sentido.

### Arranque de la maquina

La simulacion arranca con estas condiciones:

- el simulador esta detenido hasta pulsar `Start`
- el deslizador izquierdo parte desde su final exterior izquierdo
- el deslizador derecho parte desde su final exterior derecho
- la geometria inicial se configura para cumplir las restricciones globales de validez

## Restricciones geometricas

La aplicacion no acepta cambios que rompan la validez global de la maquina. Un ajuste se revierte automaticamente si incumple cualquiera de estas condiciones:

### 1. Cierre global del pantografo

La distancia entre las dos articulaciones motrices debe permanecer siempre dentro del rango que permiten las dos bielas largas.

En terminos geometricos:

- `dMax <= linkL + linkR`
- `dMin >= |linkL - linkR|`

Si esto no se cumple, hay instantes del movimiento en los que el punto trazador deja de existir.

### 2. No cruce de finales interiores

Los finales interiores izquierdo y derecho no pueden cruzarse en la maquina.

Eso evita una configuracion fisicamente incoherente, en la que ambas carreras se solapen hacia el centro.

### 3. El punto debe permanecer en la zona superior

La maquina se considera valida solo si el punto trazador permanece siempre en la zona superior respecto a la linea que une los dos ejes de los rotores.

Dicho de otra manera:

- se divide el plano en una zona superior y una inferior usando la recta entre ambos ejes
- solo se aceptan configuraciones en las que el punto geometricamente calculado nunca cae en la zona inferior

## Indicadores de validacion

La interfaz muestra dos indicadores principales:

- `CIERRE DE CURVA GARANTIZADO: SI/NO`
  Aparece dentro del bloque de geometria y resume si la configuracion actual es aceptable para toda la trayectoria.

- `GARANTIA GLOBAL: SI/NO`
  Aparece en el bloque de ecuacion y refleja el mismo estado desde el punto de vista del modelo matematico.

Mientras el indicador sea `SI`, la aplicacion permite:

- iniciar la simulacion
- modificar parametros dentro del rango valido
- guardar el trazo resultante

Si un cambio propuesto rompe la validez:

- el slider vuelve a su valor anterior
- aparece un mensaje de estado indicando el motivo del bloqueo

## Interfaz

La interfaz se divide en dos zonas:

### Panel izquierdo

Incluye todos los controles del simulador, agrupados en bloques plegables:

- geometria del pantografo
- deslizador izquierdo
- deslizador derecho
- rotor izquierdo
- rotor derecho
- ecuacion del punto trazador

Los grupos pueden plegarse y desplegarse de forma independiente.

### Zona derecha

Muestra el canvas con:

- la maquina
- la trayectoria acumulada del punto trazador
- los controles flotantes de simulacion y visualizacion

## Controles del simulador

En la parte superior del canvas aparecen dos grupos de botones.

### Controles de simulacion

- `Start`
  Inicia la simulacion si la geometria es valida.

- `Stop`
  Detiene la simulacion manteniendo la geometria y el trazo actual.

- `Reinicio`
  Restaura la geometria inicial, pone el tiempo a cero, detiene la simulacion y borra el trazo.

- `Borrar trazo`
  Elimina solo la trayectoria acumulada.

- `Guardar`
  Exporta el trazo actual a un archivo SVG.

### Controles de visualizacion

- selector de color
  Permite elegir el color de la linea del trazo. Ese mismo color se usa tambien en el SVG exportado.

- `Centrar vista`
  Ajusta la vista para encuadrar la maquina y el dibujo acumulado.

- `Zoom +`
  Aumenta la escala de visualizacion.

- `Zoom -`
  Reduce la escala de visualizacion.

- `Reset vista`
  Restablece el zoom y el desplazamiento de la vista.

## Interaccion con el canvas

El canvas soporta navegacion directa:

- rueda del raton: zoom
- arrastrar con el raton: desplazamiento de la vista

Ademas:

- el trazo se mantiene fino al hacer zoom para mejorar la nitidez visual
- la vista inicial se centra automaticamente sobre la maquina

## Sliders y ajuste fino

Todos los sliders incluyen:

- el control deslizante principal
- un boton `-` para decrementar un paso
- un boton `+` para incrementar un paso

Cada pulsacion cambia exactamente un `step` del slider correspondiente, por lo que el ajuste fino respeta la resolucion definida para cada control.

## Ecuacion del punto trazador

El bloque `Ecuacion del punto trazador` muestra:

- la expresion usada para los deslizadores izquierdo y derecho
- la expresion de las articulaciones izquierda y derecha
- la distancia entre articulaciones
- las formulas de interseccion que dan lugar al punto trazador
- los valores numericos actuales de la configuracion
- las cotas usadas en la validacion
- la posicion actual de `P(t)`

Su proposito es hacer visible la relacion entre:

- parametros de maquina
- movimiento de los ejes
- movimiento de los rotores
- trayectoria final del punto

## Exportacion a SVG

La opcion `Guardar` genera un archivo SVG que contiene:

- el trazo acumulado del punto trazador
- el color seleccionado por el usuario

Si no existe un trazo suficiente, la aplicacion muestra un aviso y no exporta nada.

## Detalles de implementacion

### Calculo del punto

El punto trazador se obtiene mediante la interseccion de dos circunferencias:

- centro izquierdo: articulacion izquierda
- radio izquierdo: brazo pantografo izquierdo
- centro derecho: articulacion derecha
- radio derecho: brazo pantografo derecho

Cuando no existe interseccion, el punto no esta definido.

### Muestreo de seguridad

La restriccion de permanencia en la zona superior se comprueba muestreando el movimiento a lo largo del tiempo. La configuracion solo se acepta si todas las muestras respetan esa condicion.

### Tecnologias usadas

- HTML5
- CSS3
- JavaScript sin dependencias
- Canvas 2D
- Blob + descarga directa para exportar SVG

## Flujo recomendado de uso

1. Ajusta la geometria base del pantografo.
2. Comprueba que el indicador de cierre garantizado siga en `SI`.
3. Define frecuencias y fases de deslizadores y rotores.
4. Pulsa `Start`.
5. Usa `Centrar vista`, zoom y arrastre para inspeccionar la trayectoria.
6. Cambia el color del trazo si lo necesitas.
7. Guarda el resultado con `Guardar`.

## Limitaciones actuales

- El proyecto es una simulacion geometrica, no una simulacion dinamica con masas, inercias o esfuerzos.
- La validacion de permanencia en zona superior se hace por muestreo temporal, no por una demostracion analitica exacta.
- La interfaz esta pensada para uso local y exploracion interactiva, no como herramienta CAD.

## Licencia

Este repositorio no declara actualmente una licencia explicita. Si vas a reutilizarlo o distribuirlo, conviene añadir una.
