# Nooki Hotel — resumen del avance (25 oct 2026)

Este archivo resume todo lo trabajado en el chat del sistema hotelero, para continuar en otro chat.
Va junto con **Nooki-Hotel-prototipo.html** (el prototipo completo en un solo archivo).

---

## 1. Qué es

**Nooki Hotel** es un sistema hotelero propio, rehecho desde cero tomando como base el sistema que se usa hoy (**Smart Hotel**, de Smart System Perú). Primero se revisó Smart Hotel solo navegando su menú, sin cambiar nada.

El estilo buscado es serio y moderno, parecido a Shopify y Claude Code. El sistema está pensado para que lo use cualquier recepcionista:
- **Modo claro** por defecto, con modo oscuro opcional.
- **Colores** que indican el estado de cada habitación.
- **Botones grandes** (44–58 px), aptos para **pantalla táctil**.
- Letra **Geist**, color principal **azul cobalto #2448c7**.

Hoy es un **prototipo navegable**: todo funciona en pantalla con datos de ejemplo, pero no tiene servidor ni base de datos. Al recargar, los datos vuelven a como estaban al inicio.

---

## 2. Pantallas que ya tiene el prototipo

| Pantalla | Qué hace |
|---|---|
| Sin ingreso | La PC de recepción abre directo con acceso completo (perfil de administrador del hotel). Ya no hay usuarios, PIN ni permisos por cargo. |
| Inicio | Resumen del día: ocupación, llegadas, salidas, ventas del mes, por cobrar y gráficos. |
| Panel de habitaciones | Las 35 habitaciones en tarjetas de colores por estado (disponible, ocupada, sale hoy, llega hoy, limpieza, inhabilitada). Al tocar una se abre el detalle: check-in, check-out, consumos, cobros, notas e historial. |
| Timeline | El calendario del mes. Se desliza con el dedo dentro del recuadro y tiene celdas grandes. Tocar un espacio libre abre una nueva reserva. Tiene flechas por semana y botón "Hoy". |
| Nueva reserva | Todo en una sola pantalla, sin scroll. Son 3 columnas: cliente y detalles → fechas y habitaciones (se eligen tocando) → resumen con el total. El precio sale solo según la temporada. |
| Reservas | Lista y búsqueda de reservas. |
| Limpieza | Tres columnas: por limpiar → limpiando → por revisar. Se asigna camarera y las llegadas de hoy van primero. Incluye repaso de habitaciones ocupadas e historial de habitaciones listas. |
| Restaurante | Mesas, pedidos, comanda, cargo a la habitación y cobro. |
| WhatsApp | Pedidos de reserva que llegan por WhatsApp: revisar el pago, confirmar y asignar habitación. |
| Ventas | Comprobantes (boleta, factura, nota de venta), anulación e IGV. |
| Caja | Abrir y cerrar caja, ingresos y salidas, arqueo (cuadra, falta o sobra) y turnos. |
| Cierre del día | Lista de revisión: llegadas sin check-in, salidas pendientes, saldos, limpieza y caja. Al cerrar, el sistema pasa al día siguiente. |
| Productos y Almacén | Stock, entradas, salidas, vencimientos y guías. |
| Clientes | Ficha de cada cliente, historial y marca de "no grato". |
| Reportes | MINCETUR mensual, reservas por origen, huéspedes, caja por turno, ventas por categoría y por método de pago, y stock. Se pueden copiar a Excel. |
| Impresión | Impresoras y cola de impresión (tickets, comandas). |
| Ajustes | Empresa, facturación SUNAT, horarios, habitaciones y tarifas, **tarifas por temporada**, orígenes y comisiones, formas de pago, personal (solo la lista del equipo para limpieza, caja y mozos) y motivos de caja. |

Funciona en computadora y en celular. Tiene **162 pruebas automáticas** y todas pasan.

---

## 3. Equipos del hotel (cerraduras)

- Las cerraduras son **ZKTeco LH6800**. Son *offline*: no tienen red, solo leen la tarjeta.
- Las tarjetas son **MIFARE S50 / S70**.
- El grabador de tarjetas es el **ZKTeco CR60W**, que va por USB a la PC de recepción.
- El software de ZKTeco, **ZKBiolock**, ya está instalado en el hotel.

### Plan de integración con ZKTeco

- **ZKBiolock se queda instalado.** Se sigue usando para configurar las cerraduras, el código del hotel, las tarjetas maestras y de emergencia, y para revisar quién abrió cada puerta.
- **Nooki se encarga de las tarjetas de huésped**: grabar en el check-in, hacer copias, extender la estadía, cambiar de habitación, tarjeta perdida, leer y anular en el check-out.
- **Un "puente"** (programa pequeño para Windows) va en la misma PC donde están ZKBiolock y el CR60W. Recibe la orden de Nooki y graba la tarjeta usando la librería oficial de ZKTeco. Funciona como la cola de impresión.
- **Hay que pedir al distribuidor de ZKTeco en Perú** el SDK o interfaz PMS de ZKBiolock para el CR60W, compatible con la versión instalada y con **el mismo código de hotel**, para que las cerraduras no se reprogramen. Debe incluir funciones para grabar, leer y anular tarjetas, con su manual. Hay que preguntar también el precio.
- **Plan B:** si el puente falla, se graba manualmente desde ZKBiolock, como se hace hoy.
- **No hacer:** escribir directo en la base de datos de ZKBiolock, ni automatizar clics sobre su pantalla.
- **Pendiente:** hacer en Ajustes una tabla que diga qué habitación de Nooki corresponde a qué habitación de ZKBiolock.

---

## 4. Decisiones tomadas para la versión real

1. **Una sola PC en recepción, sin usuarios.**
   - La PC abre directo: la pantalla de ingreso con PIN y los permisos por cargo **ya se quitaron** (25 oct).
   - Se recomendó (falta confirmar) pedir una clave solo para lo delicado: anular comprobantes, cambiar precios y entrar a Ajustes.
2. **El sistema funciona aunque no haya internet.**
   - El programa y la base de datos van en la PC de recepción, junto con el puente de ZKTeco.
3. **Una copia en la nube, cada minuto.**
   - Sirve como respaldo y para la vista del dueño.
   - Si se va el internet, la copia se pone al día sola cuando vuelve.
4. **El dueño entra desde su celular**, por una página web con usuario y contraseña.
   - Ve: ocupación, llegadas y salidas, ventas, caja y cierres del día, limpieza y reportes.
   - **No tiene** funciones de tarjetas, ni abrir o cerrar caja, ni check-in o check-out.
   - Falta definir si puede cambiar precios o temporadas, o crear reservas.
5. **Alojamiento: un subdominio del dominio propio de la empresa del usuario**, por ejemplo `hotel.suempresa.pe`. Esa empresa ya ofrece sistemas y facturación electrónica a distintos rubros.
   - Opción A, la recomendada si el servidor es estable: en el mismo servidor del portal de facturación, con certificado gratis de Let's Encrypt y una base de datos separada.
   - Opción B: en Cloudflare gratis (Pages + D1) usando el mismo subdominio. Los límites gratis son 5 GB, 5 millones de lecturas al día y 100 mil escrituras al día, y no se pausa.
   - Supabase también es gratis, pero tiene 500 MB y se pausa tras 7 días sin uso. No es la opción preferida.
6. **Facturación electrónica a través de la API propia de la empresa**, que es multiempresa y envía directo a SUNAT. No se paga un servicio de facturación aparte.
   - El hotel aparece como una empresa más en el portal.
   - Si no hay internet, los comprobantes se guardan y se envían después.
7. **Pensarlo como producto para varios hoteles**: datos separados por hotel, y cada dueño ve solo el suyo.
8. **Respaldo extra**: una copia diaria en USB o Google Drive, además de la copia en la nube.

### Datos que faltan para planear el despliegue (sin compartir claves)

- El nombre del dominio de la empresa.
- Dónde está alojado el portal: hosting, servidor en la nube (VPS) o servidor físico.
- Quién tiene acceso al panel del dominio (DNS).
- La documentación de cómo enviar un comprobante a la API de facturación.

---

## 5. Siguientes pasos (en orden)

1. **Ajustar el prototipo** al diseño final:
   - ~~Quitar la pantalla de ingreso en la PC~~ (hecho).
   - Poner la clave solo para lo delicado.
   - Crear la **versión del dueño para celular**, sin tarjetas.
2. **Agregar al prototipo el módulo de tarjetas**, con un grabador simulado:
   - Botón "Grabar tarjeta" en el check-in, copias, leer, anular en el check-out.
   - Historial de tarjetas por habitación.
   - Tabla de equivalencia de habitaciones con ZKBiolock en Ajustes.
3. **Redactar el mensaje al distribuidor de ZKTeco** pidiendo el SDK.
4. **Construir la versión real:**
   - Programa para la PC con su base de datos local.
   - Sincronización con la nube.
   - Vista del dueño.
   - Conexión con la API de facturación.
   - Puente de ZKTeco.
5. **Probar** en una sola puerta con tarjetas de prueba, luego usar unos días en paralelo con el sistema actual, capacitar al personal y empezar.

---

## 6. Notas técnicas del prototipo (para quien programe)

**Cómo está hecho**
- Es un solo archivo HTML: HTML, CSS y JavaScript sin librerías, dentro de una función autoejecutable (IIFE).
- La navegación va por la dirección de la página (`#panel`, `#timeline`, `#nueva`, `#limpieza`, `#cierre`, …).
- Los botones usan `data-act`, que se resuelve en el objeto `ACT`.
- Las listas desplegables usan `SEL[clave]`.
- Cada pantalla se dibuja con `render()`. `render({soft:true})` la vuelve a dibujar sin animación, y `refresh()` actualiza la pantalla y el panel lateral.
- Las ventanas emergentes usan `openModal`, `menu` y `openPop`. El buscador se abre con Ctrl+K.

**Datos**
- Habitaciones y reservas: `TYPES`, `ROOMS` (35 habitaciones), `RES`.
- Cobros y ventas: pagos dentro de cada reserva, y `EXTRA` para las ventas del restaurante.
- Inventario y restaurante: `PRODUCTS`, `STOCKMOV`, `TABLES`.
- Otros: `WA` (pedidos de WhatsApp), `NOGRATO`, `TURNOS`, `PRINTERS`, `CFG` (configuración), `EMP` (personal), `PERM` (permisos por cargo).
- Limpieza: `HK`, `REPASO`, `HKDONE`.
- Cierre del día y temporadas: `CIERRES`, `SEASONS`, `WEEKEND`.

**Fechas**
- Las fechas son números de día de octubre de 2026 (`TODAY=16`), con `NOW_H` como la hora actual.
- Funciones de ayuda: `dt`, `iso`, `fromIso`, `fmtD`, `fmtDL`.
- `available(hab, entrada, salida, reservaAOmitir)` revisa si una habitación está libre.

**Precios**
- `avgRate(base, entrada, salida)` aplica las temporadas noche por noche.
- `seasonLabel()` da el texto de la tarifa.

**Colores de estado**
- Clases `.st-ok`, `.st-occ`, `.st-res`, `.st-conf`, `.st-clean`, `.st-off`, `.st-out`, `.st-dan`.
- Cada una define dos variables: `--s` (color fuerte) y `--ss` (color suave).

**Pruebas**
- Se hacen con Playwright (Python). Abren el sistema en computadora (1366, 1440 y 1920 px) y en celular (390 px).
- Revisan que no haya errores ni scroll de lado, y prueban los flujos completos.

**Reglas de seguridad acordadas**
- Nunca escribir claves, contraseñas ni RUC reales en el chat ni en el sistema.
- No guardar datos reales de huéspedes en el prototipo.

---

## 7. Facturación electrónica con Nooki (agregado el 25 oct 2026)

**Nooki** es la empresa (dominio `nooki.pe`) que hace los sistemas y da la facturación. El hotel es **cliente** de Nooki: aparece como una empresa más en el facturador (`api.nooki.pe`) y se administra en `portal.nooki.pe`. Nooki Hotel tiene su propio apartado de facturación y la recepcionista nunca sale del sistema.

**Alojamiento acordado:** `hotel.nooki.pe` para la parte en la nube (copia cada minuto y vista del dueño), en un proyecto aparte de Railway con su propia base de datos. El DNS de `nooki.pe` está en Vercel.

**Lo que ya hace el prototipo (simulado):**
- **Cobro:** boleta, factura o nota de venta. En factura, el RUC completa la razón social y avisa si el RUC no pasa la validación de SUNAT. Las boletas de más de S/ 700 piden el DNI.
- **Comprobante:** estado SUNAT, botones para imprimir ticket, PDF, WhatsApp, XML y CDR, con hash y QR en la representación impresa.
- **Nota de crédito:** con motivo del catálogo SUNAT (01, 06, 07, 09, 04), monto y forma de devolución. No se puede emitir más de lo cobrado y el original no se anula mientras tenga una nota vigente.
- **Anulación con reglas:** solo comprobantes aceptados, dentro de 7 días, por comunicación de baja (facturas) o resumen diario (boletas).
- **Rechazados:** botón «Emitir de nuevo» con otro número.
- **Sin internet:** se sigue cobrando e imprimiendo; los comprobantes quedan «Sin internet» y se envían solos al volver la conexión. En Ajustes hay un interruptor para simularlo.
- **Ajustes → Facturación SUNAT:**
  - Muestra la conexión con Nooki, el RUC, el ambiente y las series (B001, F001, BC01, FC01, NV01).
  - Configura el IGV y la exoneración por la Ley de la Amazonía.
  - Define si el adelanto se factura al cobrar o en el check-out, y si el ticket se imprime solo.
  - El certificado y la clave SOL ya **no** se escriben en el hotel: viven cifrados en Nooki.

**Por confirmar con el contador del hotel:**
- Si el hospedaje va exonerado de IGV por la Ley de la Amazonía. El hotel está en Puerto Maldonado, así que es lo más probable.
- O, si no aplica la exoneración, si le corresponde el 10.5 % de los hoteles MYPE (Ley 31556).
- Cuándo se emite el comprobante de los adelantos.
- Si atiende turistas extranjeros (exportación de servicios de hospedaje). El facturador aún no tiene ese tipo de operación.

**En la versión real:** el servidor local de Nooki Hotel guarda la llave de API y usa el módulo `nooki.mjs` contra `api.nooki.pe`. Los avisos de SUNAT (webhooks) llegan a `hotel.nooki.pe` y se sincronizan con la PC. El ticket de 80 mm sale de `GET /v1/comprobantes/:id/pdf?formato=ticket`.

## 8. Clave de administrador y auditoría (agregado el 25 oct 2026)

La PC de recepción no tiene usuarios, así que lo delicado pide una **clave de administrador**:

- Entrar a **Ajustes** y a **Auditoría**.
- **Anular** un comprobante y emitir una **nota de crédito**.
- **Anular una reserva** y **cambiar el precio** de una reserva nueva.

Con la clave correcta el sistema queda en "modo administrador" 10 minutos (arriba aparece un aviso rojo con el tiempo y un botón **Bloquear**). Cinco claves equivocadas seguidas bloquean 1 minuto. La clave se cambia en Ajustes → Clave de administrador, y para eso hay que poner la actual. En el prototipo la clave de ejemplo es **1234**; en el sistema real cada hotel pone la suya el primer día y se guarda cifrada.

**Auditoría** (menú Gestión → Auditoría): registra cada movimiento con fecha, hora, módulo y detalle: reservas, check-in y check-out, cobros, comprobantes, respuestas de SUNAT, caja, cambios de ajustes, cada uso de la clave y cada clave equivocada. Se filtra por período (hoy, 7 días, mes), módulo y tipo (con clave, alertas, SUNAT), y tiene buscador. Las claves equivocadas salen resaltadas en rojo.

En la versión real:
- La auditoría se guarda en la base de datos y **no se puede editar ni borrar** (solo se agregan filas), igual que la bitácora `fe.eventos` del facturador.
- Se copia a la nube con la sincronización, y el dueño la ve desde su celular en `hotel.nooki.pe`.
- Cada fila guarda también el equipo (PC de recepción, celular del dueño).

Nota técnica: el bloque v9 está antes de `/* ---------- inicio ---------- */`. `toast()` original pasó a llamarse `toastBase()`: cada aviso del sistema se anota solo en la auditoría (con `{noAudit:true}` se evita). `anular()` original pasó a `anularBase()`. Para las pruebas el prototipo expone `window.NK`.

## 9. Reportes con filtros y Excel (agregado el 26 oct 2026)

Cada reporte tiene su propio **período**: hoy, ayer, 7 días, este mes o **elegir fechas** (desde / hasta). Además tiene **filtros según el tipo de reporte**:

| Reporte | Filtros |
| --- | --- |
| Comprobantes emitidos (nuevo) | Tipo (boleta, factura, nota de crédito, nota de venta) y estado SUNAT |
| Ocupación por día (nuevo) | Tipo de habitación |
| Ventas por método de pago | Tipo de comprobante |
| Ventas por categoría | Hotel, restaurante o ambos |
| Reservas por origen | Origen (Booking, WhatsApp, etc.); ahora con comisión y neto |
| Huéspedes | Peruanos o extranjeros y tipo de habitación |
| Reporte MINCETUR | Residentes en Perú o extranjeros |
| Caja por turno | Persona |
| Stock de almacén | Categoría y "solo stock bajo" (no tiene período: es el stock de hoy) |

Las tablas muestran una fila de **Total** al final.

**Descargar Excel** arma un archivo .xlsx de verdad, sin librerías ni internet:
- Título con el nombre del hotel, período, filtros usados y fecha en que se generó.
- Encabezado azul que queda fijo al bajar, y filtros de Excel en cada columna.
- Montos con formato de soles, fechas como fechas y porcentajes como porcentajes, así que se pueden sumar y ordenar.
- Filas alternadas y fila de total con fórmula `SUBTOTAL`, que se actualiza si filtras en Excel.
- Listo para imprimir en A4, ajustado al ancho de la hoja, con número de página.
- El nombre del archivo lleva el reporte, el hotel y las fechas.

**Descargar todos en un Excel** arma un libro con una hoja por reporte, cada una con sus filtros actuales. **Copiar** se mantiene para pegar rápido.

Nota técnica: bloque v10 antes de `/* ---------- inicio ---------- */`. Reemplaza `REPS`, `repData` (ahora devuelve columnas con tipo: t, i, m, d, p, h) y `renderReportes`. El .xlsx lo arman `xlsxBlob()` y `zipBlob()` (ZIP sin compresión con CRC32).

## 10. Agregar habitaciones y tipos (agregado el 28 oct 2026)

En **Ajustes → Habitaciones y tarifas** (pide la clave de administrador):

- **Agregar habitación**: número, tipo, piso y si está a la venta. Con el campo **Hasta** se crean varias seguidas de una vez (por ejemplo, 501 a 510 para un piso nuevo, máximo 50). No deja repetir números.
- **Editar**: tocando una habitación se le cambia el tipo o el piso. El número solo se puede cambiar si la habitación nunca tuvo reservas.
- **Quitar de la venta** con el interruptor (mantenimiento o remodelación). No se puede si tiene huéspedes en ese momento.
- **Eliminar**: solo si nunca tuvo reservas. Si tiene historial, el sistema pide sacarla de la venta en vez de borrarla, porque los reportes la necesitan.
- **Agregar tipo** (Suite, Familiar…) con nombre, personas, camas y tarifa. Un tipo se puede editar, y se elimina solo si no tiene habitaciones.
- Las habitaciones se ven agrupadas por piso. El panel, el timeline y la nueva reserva toman los pisos y las habitaciones nuevas solos. El piso 0 es "Áreas comunes".

Todo queda en Auditoría (por ejemplo, "8 habitaciones agregadas (501 a 508) · Matrimonial Queen · Piso 5").

Nota técnica: bloque v11. `roomsHTML()` arma los pisos con `pisos()` en vez de la lista fija 1–4. `tarifasBody()` reemplaza el cuerpo de la sección tarifas; `saveCfg` sigue leyendo `[data-rate]`.
