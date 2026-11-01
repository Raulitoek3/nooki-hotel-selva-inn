# CLAUDE.md — Nooki Hotel (sistema del Hotel Selva Inn)

Contexto completo para cualquier chat de Claude Code que trabaje en este repositorio. Léelo entero antes de cambiar algo. Si en un chat se toma una decisión importante, **actualiza este archivo** en el mismo cambio.

---

## 1. Qué es y quién es quién

- **Nooki** (`nooki.pe`) es la empresa de software de Raúl. Vende **sistemas a medida y sistemas base por rubro** (hoteles, restaurantes, etc.) y da la **facturación electrónica SUNAT** con su facturador propio (`api.nooki.pe`). Cobra una mensualidad.
- **Este repositorio es el sistema hotelero "Nooki Hotel"**, hecho para un cliente de Nooki: el **Hotel Selva Inn** (Puerto Maldonado, Madre de Dios). Razón social y RUC: por confirmar. No escribirlos en el chat. Se cargan en la configuración cuando Raúl los dé por el canal que corresponda.
- El hotel es **cliente** de Nooki. Su sistema vive aparte (su propio Supabase, su propio repositorio) y **solo se une a Nooki por la API de facturación**.
- **Raúl (dueño de Nooki) no programa.** Claude escribe todo el código. Raúl decide, prueba y hace los trámites. Explicarle en **español sencillo**, con pasos concretos y comandos exactos para copiar y pegar. Prefiere entregas completas y listas, no ir y venir.
- Este chat **solo trabaja en el sistema del hotel.** Nada del facturador de Nooki ni de otros clientes se cambia desde aquí. Si hace falta algo en Nooki (una serie nueva, una ruta de la API, un ajuste de la empresa), se anota para hacerlo en el chat del facturador (repo `Raulitoek3/Facturador-Electronico`).

## 2. Reglas que no se rompen

- **Nunca** pedir ni escribir en el chat, en el código ni en el repo: contraseñas, claves SOL, certificados (.pfx), secretos de API (`X-Api-Secret`), secreto de webhooks (`whsec_…`), llaves `service_role` de Supabase. Se guardan como **secretos** en Supabase (los pone Raúl en el panel o por un comando que él corre) o cifrados en Nooki.
- La llave y el secreto de Nooki **nunca llegan al navegador**. Solo los usa una Edge Function de Supabase.
- **No guardar datos reales de huéspedes** en el prototipo ni en pruebas. En el sistema real, los datos de huéspedes (DNI, pasaporte, teléfono) son datos personales: protegidos con RLS y sin exponerlos en enlaces públicos.
- Mensajes, nombres de tablas, columnas y comentarios **en español**.
- Antes de entregar: correr las pruebas y mirar capturas (escritorio y celular).
- `.env`, `.pfx`, `.pem` y llaves en `.gitignore`.

## 3. Arquitectura decidida (31/10/2026)

```
Nooki (oficinavirtual@nooki.pe)
├── api.nooki.pe (Railway)   → facturación de todos los clientes   ◄── API ──┐
└── Cloudflare (DNS de nooki.pe y páginas)                                  │
                                                                            │
Hotel Selva Inn (cuenta propia, con correo del hotel)                        │
├── Supabase propio (plan gratis al inicio) → toda la operación del hotel ──┘
│     tablas + RLS + Auth + Edge Functions (facturar, avisos de Nooki)
└── pantallas publicadas en selvainn.nooki.pe (Cloudflare Pages, cuenta de Nooki)
```

- **Un Supabase por cliente, en la cuenta del cliente** (organización propia creada con el correo del hotel, que es Owner). Nooki no paga por proyecto. Si el hotel necesita el plan Pro (unos 25 USD al mes), lo paga el hotel.
- **oficinavirtual@nooki.pe se invita como Developer**, nunca Owner ni Administrator. Si fuera administrador, Supabase le contaría a Nooki los proyectos gratis del cliente y no dejaría crear más.
- **Región: São Paulo (sa-east-1).**
- El conector de Supabase de Claude trabaja con **una organización a la vez**. Para este repo, Raúl lo conecta con la cuenta del hotel. Al terminar, lo vuelve a la cuenta de Nooki.
- **Pantallas en `selvainn.nooki.pe`**: Cloudflare Pages en la cuenta de Nooki (oficinavirtual@nooki.pe, id `bc28dd013d13ff6329a108a3ce937619`), conectado a este repositorio, que publica solo con cada push a `main`. El **DNS de nooki.pe está en Cloudflare** (nameservers `liv`/`ram.ns.cloudflare.com`), así que el subdominio se agrega en el mismo proyecto de Pages (Custom domains). Vercel ya no se usa para Nooki.
- **Subdominios de los negocios (decidido 31/10/2026): `<negocio>.nooki.pe`**, solo con el nombre comercial del negocio. El hotel queda en **`selvainn.nooki.pe`** (antes se había pensado `hotel.nooki.pe`; se descartó porque es el nombre del rubro y no sirve si Nooki tiene un segundo hotel).
  - Regla: nombre comercial en minúsculas, sin espacios, tildes ni símbolos (`ñ` → `n`). Sin "nooki" (ya va en `.nooki.pe`) y sin el rubro.
  - Si choca con otro cliente o con un nombre reservado de Nooki (`api`, `portal`, `www`, `app`, `admin`, `mail`), se agrega la ciudad con guion: `selvainn-pmaldonado.nooki.pe`.
  - Un solo nivel (`x.nooki.pe`), nunca `x.hotel.nooki.pe`: el certificado gratis de Cloudflare solo cubre un nivel.
  - Si un cliente tiene dominio propio y lo pide, se puede sumar después (por ejemplo `sistema.<sudominio>`), sin quitar el de `nooki.pe`.
- **Plan gratis de Supabase: dos cosas que cubrimos nosotros.**
  1. **Respaldos**: el plan gratis no hace copias. Hay que montar una copia diaria (pg_dump) guardada del lado de Nooki o en un Drive del hotel. Pendiente.
  2. **Pausa**: el proyecto gratis se pausa tras 7 días sin uso. El hotel lo usa a diario, pero se deja una revisión automática que lo mantenga activo.
- **Firebase descartado**: los datos son relacionales (reservas, pagos, caja, reportes), Firebase pide plan de pago para funciones de servidor y cobra por lectura.
- **Sin internet en recepción** (decisión para arrancar): la web guarda lo pendiente en el navegador (cola local) y lo sube al volver la conexión; los comprobantes quedan "Sin internet" y se envían después (ya simulado en el prototipo). La opción de una app instalada en la PC con base local queda para más adelante si la conexión del hotel lo exige. Confirmar con Raúl antes de construir la cola.

### Cómo trabaja el hotel
- **Una PC en recepción, sin usuarios para el personal.** La PC entra una vez con la cuenta del hotel (Supabase Auth) y queda abierta.
- **Clave de administrador** para lo delicado (ya en el prototipo): entrar a Ajustes y Auditoría, anular comprobantes, notas de crédito, anular reservas, cambiar precios de una reserva. Abre 10 minutos (renovable), botón "Bloquear", 5 intentos fallidos = espera de 1 minuto. En el sistema real: guardada con hash (nunca en texto), verificada en el servidor (función o RPC), no en el navegador.
- **Auditoría** de todo con fecha y hora, solo agregar (sin editar ni borrar): en el real, tabla con permisos de solo `insert`/`select` y disparadores.
- **El dueño del hotel entra desde su celular** con su propio usuario: ve ocupación, llegadas, salidas, ventas, caja, cierres, limpieza, reportes y auditoría. No tiene tarjetas ni caja ni check-in/out. Falta definir si puede cambiar precios o crear reservas.
- **Personal** (camareras, mozos, cajeros) es solo una lista para asignar tareas; no entran al sistema.

## 4. Conexión con Nooki (facturación)

El hotel es una **empresa** en el facturador de Nooki. Se da de alta y se configura en el **portal de Nooki** (`portal.nooki.pe`), no aquí: certificado digital, usuario SOL secundario, series, ambiente (beta → producción) y la marca de Amazonía. Desde el portal se sacan la **llave y el secreto de API**.

### Dónde se guardan las llaves
- Secretos de la Edge Function (los pone Raúl): `NOOKI_URL` (`https://api.nooki.pe`), `NOOKI_KEY`, `NOOKI_SECRET`, `NOOKI_WHSEC` (secreto de webhooks).
- El navegador llama a la Edge Function del hotel (con la sesión de Supabase). La función valida, arma el comprobante y llama a Nooki. Mismo modelo que ya funciona en EcoFlow (funciones `facturar`, `nooki-comprobante`, `nooki-estado`).

### API de Nooki (`https://api.nooki.pe`, versión `/v1`)
- Autenticación en cada pedido: cabeceras `X-Api-Key` y `X-Api-Secret`.
- **Siempre** mandar `Idempotency-Key` al emitir (por ejemplo, `hotel:pago:<id_del_pago>`): si se repite por un corte, no duplica. 201 = creado, 200 = repetido con la misma clave.
- Errores: `{ "error": { "codigo", "mensaje", "campo" } }`. 429 = límite del plan.
- Documentación completa: `GET https://api.nooki.pe/openapi.json`. Módulo JS oficial: `GET https://api.nooki.pe/sdk/nooki.mjs` (solo servidor; se niega a correr en navegador; manda Idempotency-Key solo y verifica avisos).

| Método | Ruta | Para qué |
| --- | --- | --- |
| POST | `/v1/boletas` | Boleta (serie `B…`). Sin `cliente` → CLIENTES VARIOS, máximo S/ 700. |
| POST | `/v1/facturas` | Factura (serie `F…`). `cliente` obligatorio con RUC (`tipo_doc: "6"`). |
| POST | `/v1/notas-credito` | `serie` (`BC..`/`FC..`), `comprobante_afectado_id` o `comprobante_afectado` ("B001-25"), `motivo`, `descripcion_motivo`, `items` (en 01, 02, 06 sin ítems copia los del original). |
| POST | `/v1/notas-debito` | Igual, con `items` obligatorios. |
| GET | `/v1/comprobantes`, `/v1/comprobantes/:id` | Lista (filtros `tipo_doc`, `estado`, `desde`, `hasta`, `limite`, `despues_de`) y detalle. |
| GET | `/v1/comprobantes/:id/pdf` | PDF A4; `?formato=ticket` (80 mm) o `?formato=ticket58` (58 mm). |
| GET | `/v1/comprobantes/:id/xml`, `/cdr` | XML firmado y constancia de SUNAT. |
| POST | `/v1/comprobantes/:id/anular` | `{ motivo }` → baja (facturas) o resumen diario estado 3 (boletas). |
| POST | `/v1/comprobantes/:id/reenviar` | Reenvía uno en `error` o `por_verificar` con el mismo número. |
| POST | `/v1/comprobantes/:id/validez` | Consulta en SUNAT si el comprobante es válido. |
| DELETE | `/v1/comprobantes/:id` | Solo pruebas de beta o comprobantes en `error`. |
| GET/PUT/DELETE | `/v1/webhook` | Ver, configurar (`{ url }`) o quitar el aviso. También `/secreto`, `/prueba`, `/entregas`. |
| GET | `/v1/empresa`, `/v1/series` | Datos de la empresa (ambiente, amazonía) y sus series. |

**Cuerpo de una boleta (ejemplo):**
```json
{
  "serie": "B001",
  "cliente": { "tipo_doc": "1", "num_doc": "<DNI>", "razon_social": "<Nombre>" },
  "items": [
    { "descripcion": "Hospedaje Hab. 310 Matrimonial Queen · 14 al 16 oct", "unidad": "ZZ", "cantidad": 2, "precio_unitario": 180 },
    { "descripcion": "Agua mineral 625 ml", "unidad": "NIU", "cantidad": 2, "precio_unitario": 3.5 }
  ]
}
```
- `precio_unitario` es el precio cobrado (con IGV si es gravado). O `valor_unitario` sin IGV.
- `tipo_doc` del cliente: `1` DNI, `4` carné de extranjería, `7` pasaporte, `6` RUC, `0` sin documento.
- Hospedaje y servicios con unidad **`ZZ`**; productos con **`NIU`**.
- `tip_afe_igv`: `10` gravado, `20` exonerado, `30` inafecto, `40` exportación. Si la empresa está marcada **Amazonía** en Nooki, los ítems sin `tip_afe_igv` salen exonerados (20) con su leyenda.
- `forma_pago`: `Contado` (por defecto) o `Credito` con `cuotas`.
- La respuesta trae `id`, `numero`, `estado`, `totales`, `hash`, `qr` y `enlaces` (incluye **`pdf_publico`**: enlace sin llaves para mandar al huésped por WhatsApp; súmale la dirección de la API).

### Estados de un comprobante y qué hace el hotel
- `pendiente` / `enviando` → mostrar "Enviando a SUNAT".
- `aceptado` (código 0) y `observado` (4000+) → válidos.
- `rechazado` (2000–3999) → el número queda usado; se emite **otro** comprobante ("Emitir de nuevo").
- `error` → Nooki no lo registró en SUNAT; se corrige y se reenvía con el mismo número.
- `por_verificar` → Nooki lo está consultando; no reenviar a ciegas.
- `anulado` → anulado en SUNAT.
- Reglas: anular solo aceptados/observados, sin nota de crédito vigente, dentro de **7 días** (confirmar con contador). Emisión con hasta 3 días de atraso. Boleta de más de S/ 700 exige DNI. Factura exige RUC válido.

### Avisos (webhooks) de Nooki al hotel
- URL: una Edge Function del hotel (por ejemplo `https://<ref>.supabase.co/functions/v1/nooki-aviso`), configurada con `PUT /v1/webhook`. Debe aceptar llamadas sin sesión (`verify_jwt = false`) y validar la firma.
- Cabecera `Nooki-Firma: t=<unix>,v1=<hex>`, donde `v1 = HMAC-SHA256(NOOKI_WHSEC, t + "." + cuerpo_crudo)`. Rechazar si la firma no coincide o si `t` tiene más de 5 minutos. Responder 2xx rápido.
- `Nooki-Entrega` = id único del aviso: guardarlo para no procesar dos veces el mismo.
- Eventos: `comprobante.{aceptado,observado,rechazado,error,por_verificar,anulado}`, `resumen.{…}`, `webhook.prueba`. El cuerpo: `{ id, evento, creado_en, empresa, data: { comprobante | resumen | mensaje } }`.
- Con el aviso se actualiza el estado del comprobante en la tabla del hotel (y se puede imprimir solo el ticket al aceptarse).

### Por confirmar con el contador del hotel
- ~~Amazonía o 10.5 %~~ **Decidido (01/11/2026): el hotel está exonerado por la Ley de la Amazonía (Ley 27037).** `config.amazonia = true` (migración `0008`). En Nooki la empresa también debe quedar marcada **Amazonía** (hacerlo en el chat del facturador) para que los ítems salgan con `tip_afe_igv` 20 y la leyenda.
- Cuándo se emite el comprobante de los **adelantos** (al cobrar o en el check-out).
- Si atiende turistas extranjeros como **exportación de servicios de hospedaje**: el facturador aún no tiene ese tipo de operación (pedirlo en el chat de Nooki si hace falta).
- Plazo de anulación.

Series previstas para el hotel (se crean en Nooki): `B001` boletas, `F001` facturas, `BC01` notas de crédito de boletas, `FC01` de facturas. `NV01` es la nota de venta **interna** del hotel (no va a SUNAT ni a Nooki).

## 5. El prototipo (lo que ya existe)

Archivo **`prototipo/Nooki-Hotel-prototipo.html`**: un solo archivo con todo (HTML, CSS y JS sin librerías, dentro de una función autoejecutable). Datos de ejemplo en memoria: al recargar vuelve al inicio. Se abre con doble clic o con `npx serve prototipo`. **Es la referencia de diseño y de flujos para el sistema real.**

Estilo: serio y moderno (tipo Shopify / Claude Code), modo claro por defecto y oscuro opcional, letra Geist, azul cobalto `#2448c7`, botones grandes (44–58 px) para pantalla táctil, colores por estado de habitación. Títulos de grupos del menú en `#242833` (en oscuro `#dfe3ec`).

**Marca del hotel en su sistema (decidido 31/10/2026):** lo que ve el hotel (`app/` y la vista previa) **no dice "Nooki"**: lleva el logo y el nombre del hotel, con el estilo de su web (https://www.hotelselvainn.com). "Nooki Hotel" queda solo como nombre interno del producto (repo, prototipo).
- Logo: `app/logo.svg` (círculo dorado `#DB8E1F` con dos palmeras blancas, redibujado de su web) + "HOTEL SELVA INN" en mayúsculas con serifa + "PUERTO MALDONADO · PERÚ" en dorado. También es el ícono de la pestaña.
- Letras: **Playfair Display** (títulos y nombre) y **Plus Jakarta Sans** (textos), de Google Fonts.
- Colores: dorado `#DB8E1F` solo en logo y adornos; botones y enlaces en ámbar oscuro **`#9A5A0E`** (contraste 5.46:1 con blanco); fondo crema `#F7F3ED`; en oscuro el acento es `#E9A94A` con texto oscuro. Los colores por estado de habitación no cambian.
- Nombre y lugar en `app/config.js` (`window.CONFIG_HOTEL`: `hotel`, `lugar`).
- La vista previa se marca sola al copiarla (`pruebas/copiar_vista_previa.py` cambia logo, nombre, colores, letras y datos; el prototipo original no se toca). Ahí siguen las menciones a **Nooki como facturador** (pantallas de facturación electrónica): pendiente que Raúl decida si se cambian por "facturador" genérico.
- El admin se muestra como "Administrador" (migración `0007`).
- La dirección web sigue siendo `selvainn.nooki.pe`. Si el hotel no quiere "nooki" ni en la dirección, se suma `sistema.hotelselvainn.com` (hace falta acceso al DNS de su dominio).

### Pantallas
| Pantalla | Qué hace |
|---|---|
| Inicio | Resumen del día: ocupación, llegadas, salidas, ventas, por cobrar, gráficos. |
| Panel de habitaciones | Tarjetas por piso y color por estado. Detalle: check-in, check-out, consumos, cobros, notas, historial. |
| Timeline | Calendario del mes, celdas grandes, tocar espacio libre = nueva reserva. |
| Nueva reserva | 3 columnas sin scroll: cliente → fechas y habitaciones → resumen. Precio por temporada. Cambiar el precio pide clave. |
| Reservas | Lista y búsqueda. Anular reserva pide clave. |
| Limpieza | Por limpiar → limpiando → por revisar, camarera asignada, repaso de ocupadas. |
| Restaurante | Mesas, pedidos, comanda, cargo a la habitación, cobro. |
| WhatsApp | Pedidos de reserva: revisar pago, confirmar y asignar habitación, o rechazar. |
| Ventas | Comprobantes con estado SUNAT, ticket, PDF, WhatsApp, XML, CDR, nota de crédito, anular (con clave), emitir de nuevo. |
| Caja | Abrir/cerrar, ingresos/salidas, arqueo, turnos. |
| Cierre del día | Revisión de pendientes; al cerrar pasa al día siguiente. |
| Productos y Almacén | Stock, entradas, salidas, vencimientos. |
| Clientes | Ficha, historial, "no grato". |
| Reportes | Comprobantes emitidos, ocupación por día, ventas por método y por categoría, reservas por origen, huéspedes, MINCETUR, caja por turno, stock. Cada uno con **período** (hoy, ayer, 7 días, mes, fechas elegidas) y **filtros propios**, fila de total, **Descargar Excel** (.xlsx real, sin librerías) y **Descargar todos** (una hoja por reporte). |
| Impresión | Impresoras y cola (tickets, comandas). |
| Auditoría | Todo lo que pasa, con fecha y hora, filtros por período, módulo y tipo (con clave, alertas, SUNAT). Pide clave. |
| Ajustes | Empresa, Facturación SUNAT (conexión con Nooki, series, IGV/Amazonía, adelantos, impresión automática, simular sin internet), horarios, **habitaciones y tarifas** (agregar habitaciones una o varias seguidas "501 a 510", editar tipo/piso, quitar de la venta, eliminar si nunca tuvo reservas; agregar/editar/eliminar tipos), tarifas por temporada, orígenes y comisiones, formas de pago, personal, motivos de caja, **clave de administrador**. Todo Ajustes pide clave. |

### Cómo está hecho (para quien programe)
- Navegación por hash (`#panel`, `#timeline`, `#reportes`…). Vistas en `VIEWS`; `render()` / `render({soft:true})` / `refresh()`.
- Botones con `data-act` → objeto `ACT` (se extiende con `Object.assign(ACT,{…})`). Selects con `SEL[clave]` + `sel()`. Modales `openModal({title,body,foot,onMount})`, `menu`, `openPop`, `toast(msg,{icon})`. Ayudas `lt()`, `cell()`, `sw()`, `inp()`, `kpiBox()`.
- Las versiones se agregaron como bloques al final, antes de `/* ---------- inicio ---------- */`; una función declarada después reemplaza a la anterior (hoisting): v7 facturación, v8 sin usuarios, v9 clave y auditoría (`toast` original = `toastBase`, `anular` original = `anularBase`), v10 reportes y Excel (`xlsxBlob`, `zipBlob`), v11 habitaciones (`tarifasBody`, `pisos()`).
- Datos: `TYPES`, `TYPE_ORDER`, `ROOMS` (`{n,t,f,off,cleaning}`), `RES` (reservas con `pays`, `items`, `log`), `EXTRA` (ventas del restaurante), `PRODUCTS`, `STOCKMOV`, `TABLES`, `WA`, `NOGRATO`, `TURNOS`, `PRINTERS`, `CFG`, `EMP`, `HK`, `REPASO`, `HKDONE`, `CIERRES`, `SEASONS`, `WEEKEND`, `AUD` (auditoría), `ADM` (clave).
- Fechas: número de día de octubre 2026 (`TODAY=16`, `DAYNO=210`); `dt`, `iso`, `fromIso`, `fmtD`, `fmtDL`. `available(hab, entrada, salida, omitir)`. Precios: `avgRate()`, `seasonLabel()`.
- Estados: clases `.st-ok`, `.st-occ`, `.st-res`, `.st-conf`, `.st-clean`, `.st-off`, `.st-out`, `.st-dan` con `--s` y `--ss`.
- `window.NK` expone ganchos para las pruebas (`adm`, `anular`, `toast`, `res`, `renovar`, `xlsx`, `rooms`, `quitar`).

### Pruebas del prototipo
`prototipo/pruebas_nooki.py` (Playwright con Python, Chromium). **162 pruebas**, todas pasan. Se corre con:
```bash
pip install playwright openpyxl --break-system-packages   # una vez
NOOKI_SRC=prototipo/Nooki-Hotel-prototipo.html NOOKI_OUT=capturas/ python3 prototipo/pruebas_nooki.py
```
Revisa todas las vistas en escritorio (1440 px) y celular (390 px, sin scroll de lado), flujos completos, clave, auditoría, reportes y Excel, habitaciones. Correr 2 veces: hay una o dos pruebas sensibles a tiempos.

## 6. Cerraduras ZKTeco (pendiente)

- Cerraduras **ZKTeco LH6800** (offline), tarjetas **MIFARE S50/S70**, grabador **CR60W** por USB en la PC de recepción, software **ZKBiolock** instalado.
- ZKBiolock se queda para configurar cerraduras, código del hotel, tarjetas maestras y ver aperturas. **Nooki Hotel maneja las tarjetas de huésped** (grabar en check-in, copias, extender, cambio de habitación, perdida, anular en check-out) mediante un **puente** pequeño para Windows en la PC de recepción, que recibe órdenes y graba con la librería oficial de ZKTeco (como una cola de impresión).
- Pedir al distribuidor de ZKTeco en Perú el **SDK / interfaz PMS** de ZKBiolock para el CR60W, compatible con la versión instalada y con el **mismo código de hotel**. Plan B: grabar a mano en ZKBiolock. **No** escribir en la base de ZKBiolock ni automatizar clics.
- Falta: tabla en Ajustes de equivalencia habitación Nooki ↔ habitación ZKBiolock.

## 7. WhatsApp (plan)

- **Pedidos de reserva**: API oficial de WhatsApp Business (Meta), con la cuenta del hotel. Los mensajes llegan a una Edge Function (no a la PC). Un asistente pide fechas, personas, DNI y foto del pago; el pedido aparece en recepción ("En curso" / "Por confirmar"). **Recepción verifica el pago en la app del banco o Yape** antes de confirmar (una foto se puede falsificar). Al confirmar: reserva confirmada con origen WhatsApp, boleta del adelanto por Nooki y respuesta al cliente con el enlace del PDF. Rechazar con motivo; vence a las 24 h sin respuesta. Responder dentro de 24 h es gratis; mensajes iniciados por el hotel tienen costo de Meta (revisar precios al activarlo).
- **Mandar el comprobante**: botón que abre WhatsApp con el número del cliente y el `pdf_publico` de Nooki. No necesita la API de Meta.

## 8. Plan para pasar del prototipo al sistema real (en orden)

1. **Preparación (Raúl):** correo del hotel → cuenta de Supabase con ese correo → organización del hotel (plan Free) → invitar a oficinavirtual@nooki.pe como **Developer** → conectar el conector de Supabase de Claude a esa cuenta.
2. **Proyecto Supabase** del hotel en São Paulo. Migraciones SQL versionadas en `supabase/migraciones/` (aplicadas con el conector). Tablas propuestas: `config`, `tipos_habitacion`, `habitaciones`, `temporadas`, `clientes`, `reservas`, `reserva_huespedes`, `consumos`, `pagos`, `comprobantes` (con `nooki_id`, `numero`, `estado`, `enlace_pdf`), `productos`, `movimientos_stock`, `mesas`, `pedidos`, `caja_turnos`, `caja_movimientos`, `limpieza`, `cierres`, `pedidos_whatsapp`, `auditoria` (solo insertar), `personal`. RLS en todas: solo usuarios del hotel; el dueño con rol de solo lectura donde corresponda.
3. **Edge Functions:** `facturar` (emite boleta/factura/NC en Nooki con Idempotency-Key y guarda el resultado), `nooki-aviso` (webhook con firma), `nooki-estado` (consulta un comprobante). La clave de administrador ya quedó como funciones RPC en la base (ver sección 9).
4. **Pantallas:** pasar el prototipo a leer y guardar en Supabase manteniendo el mismo diseño. Separar en archivos (HTML/CSS/JS sin compilación, como el portal de Nooki) o un proyecto Vite si crece. Cola local para cuando no hay internet.
5. **Nooki (en su chat):** dar de alta la empresa del hotel en beta, series B001/F001/BC01/FC01, llaves de API; Raúl sube certificado y SOL en el portal. Prueba en beta con todos los casos; luego producción.
6. **Publicar** en Cloudflare **Workers con archivos estáticos** (Cloudflare ya recomienda Workers en vez de Pages para sitios nuevos; su panel lleva a ese flujo). Proyecto `nooki-hotel-selva-inn` en la cuenta de Nooki, conectado a GitHub (rama `main`): **sin comando de build**, comando de despliegue `npx wrangler deploy`. Todo está en **`wrangler.jsonc`** (raíz del repo): publica solo `app/`, página `404.html`, y el dominio **`selvainn.nooki.pe`** como *custom domain* (el DNS se crea solo porque `nooki.pe` está en la misma cuenta); también deja una dirección `*.workers.dev` para revisar. `app/_headers` pone las cabeceras de seguridad (CSP que solo deja hablar con el Supabase del hotel y Google Fonts, sin iframes, `noindex`); si se agrega otro servicio externo, sumarlo a la CSP. **Nada que no deba ser público va dentro de `app/`** (las pruebas están en `pruebas/`). Validar antes de subir cambios de publicación con `npx wrangler deploy --dry-run`. **Si un push no aparece en Deployments**: en Settings → Builds sale el aviso *"This project is disconnected from your Git account"*; se arregla con **Manage** (reautorizar la app *Cloudflare Workers and Pages* en GitHub con acceso al repo) o Disconnect + Connect con los mismos datos. Pasó el 31/10/2026 y se reconectó.
7. **Respaldo diario** y revisión para que el proyecto gratis no se pause. **Hecho** con GitHub Actions (`respaldo-diario.yml`); falta que Raúl ponga el secreto `SUPABASE_DB_URL`.
8. Vista del dueño en celular; módulo de tarjetas ZKTeco con el puente; WhatsApp.
9. Prueba en paralelo con el sistema actual del hotel (Smart Hotel, de Smart System Perú), capacitación y arranque.

## 9. Base de datos (Supabase del hotel)

- Organización: `hotelselvainn@gmail.com's Org` (id `nlrlhpgzelfehcycjdla`, plan Free).
- Proyecto: **`nooki-hotel-selva-inn`**, ref **`cuwfogndinvrjszsbcpc`**, región `sa-east-1`. URL: `https://cuwfogndinvrjszsbcpc.supabase.co`.
- Migraciones en `supabase/migraciones/` (aplicadas con el conector, en orden). **Toda migración nueva va como archivo nuevo numerado (0006, 0007…); nunca editar una ya aplicada.**
  - `0001_base`: extensiones (`pgcrypto`, `btree_gist`), `usuarios`, funciones de rol, clave de administrador, `auditoria`.
  - `0002_ajustes`: `config` (una fila), `series`, `tipos_habitacion`, `habitaciones`, `temporadas`, `origenes`, `formas_pago`, `motivos_viaje`, `motivos_caja`, `personal`, `mesas`, `impresoras`.
  - `0003_operacion`: `clientes`, `productos`, `movimientos_stock`, `reservas`, `reserva_huespedes`, `pedidos`, `pedido_items`, `consumos`, `caja_turnos`, `comprobantes`, `pagos`, `caja_movimientos`, `limpieza`, `cierres`, `pedidos_whatsapp`, `avisos_nooki`.
  - `0004_seguridad`: RLS, permisos y auditoría automática.
  - `0005_datos_iniciales`: config, series B001/F001/BC01/FC01/NV01, 7 tipos y 35 habitaciones, orígenes, formas de pago, motivos de viaje, 22 mesas, 4 impresoras (sin IP). **Sin** productos, personal ni temporadas: se cargan en Ajustes.
  - `0006_rol_admin`: rol `admin`, columna `usuarios.correo`, `es_admin()`, y disparador `alta_admin_nooki` en `auth.users`: la cuenta **oficinavirtual@nooki.pe** queda como `admin` sola apenas se crea en Authentication.
  - `0007_marca_y_datos_hotel`: datos públicos del hotel en `config` (nombre comercial "Hotel Selva Inn", dirección Jr. 28 de Julio 541, teléfono +51 946 895 818, correo info@hotelselvainn.com) y admin con nombre "Administrador".
  - `0008_amazonia`: `config.amazonia = true`.
  - `0009_numeracion_interna`: `siguiente_numero_interno(serie)` (solo `service_role`) para numerar NV01 sin repetir.

### Reglas de la base (decididas)
- **Usuarios** (`usuarios`, ligado a `auth.users`), tres roles:
  - `admin`: cuenta de Nooki (oficinavirtual@nooki.pe). Todas las funciones; para él la clave siempre cuenta como abierta (`admin_abierto()` = true); puede poner una clave de administrador nueva sin saber la anterior; crea y maneja los usuarios del hotel.
  - `recepcion`: la PC de recepción; lee y escribe; lo delicado pide la clave.
  - `dueno`: solo lectura.
  - Sin fila en `usuarios` (o `activo = false`) = no ve nada. Sin sesión (`anon`) = no ve nada.
  - **Las cuentas se crean desde el portal** (pantalla Usuarios, solo `admin`), que llama a la Edge Function **`usuarios`** (`supabase/funciones/usuarios/index.ts`, `verify_jwt` activo). Acciones: `listar`, `crear` (correo, nombre, rol, contraseña ≥ 8), `cambiar` (nombre, rol, activo; desactivar también bloquea el ingreso en Auth), `clave` (contraseña nueva). No deja quitar el último admin ni quitarse el rol a uno mismo. Usa la `service_role` que Supabase pone sola en el entorno de la función. Todo queda en auditoría.
- **Ajustes** (config, series, tipos, habitaciones, temporadas, orígenes, formas de pago, motivos, personal, mesas, impresoras): escribir pide `recepcion` **y** clave abierta (o ser `admin`).
- **Clave de administrador**: hecha como funciones RPC en la base (no Edge Function): `hay_clave()`, `cambiar_clave(actual, nueva)` (la primera vez solo la nueva, mínimo 4 caracteres), `verificar_clave(clave)` → `{ok, hasta}` o `{ok:false, motivo: incorrecta|espera|sin_clave|sin_permiso}`, `renovar_clave()`, `bloquear_clave()`. Hash bcrypt en `clave_admin` (sin acceso desde el navegador). 10 minutos; 5 fallos = 1 minuto de espera. La sesión abierta vive en `sesiones_admin`.
- **Reservas**: no se pueden cruzar en la misma habitación (restricción `reservas_sin_cruce`, salvo anuladas/no_show). Cambiar `tarifa` o pasar a `anulada` pide clave (disparador). No se borran.
- **Comprobantes** y **avisos_nooki**: el navegador solo lee; los escribe el servidor (Edge Functions con `service_role`).
- **Auditoría**: disparador `auditar()` en las tablas importantes (en cambios guarda solo los campos que cambiaron, y si la clave estaba abierta). El navegador puede agregar eventos propios (`tipo` cambio/alerta, sin `tabla`). No se edita ni se borra (disparador que lo impide).
- **Stock**: se cambia solo con `movimientos_stock` (disparador que suma/resta y no deja quedar en negativo).
- Una sola caja abierta a la vez; una limpieza abierta por habitación; un pedido abierto por mesa.
- Pruebas de las reglas: se corren en un bloque `do $$ … raise exception $$` para que todo se deshaga (la auditoría no se puede borrar, así que nunca probar con datos que queden). Al 31/10 pasaron las 19.

## 10. Estado al 31/10/2026

- Prototipo v11 terminado (162 pruebas pasando): facturación simulada con Nooki, sin usuarios, clave de administrador, auditoría, reportes con filtros y Excel, gestión de habitaciones y tipos, títulos del menú en `#242833`.
- Repositorio `Raulitoek3/nooki-hotel-selva-inn` (privado) creado.
- Paso 1 y paso 2 del plan hechos: proyecto Supabase del hotel creado y base de datos lista (32 tablas, RLS en todas, pruebas de reglas pasando).
- Rol `admin` y Edge Function `usuarios` publicados. Primera parte de la app real en **`app/`** (HTML/CSS/JS sin compilación): ingreso con correo y contraseña, Inicio y pantalla **Usuarios** (solo admin: agregar, editar rol/nombre, desactivar, contraseña nueva). `app/config.js` tiene la URL y la llave *publishable* (pública). supabase-js va copiado en `app/vendor/` (versión fija 2.117.3). Pruebas: `node pruebas/pruebas_app.js` (Playwright con Supabase simulado; 251 pasando (ver abajo): ingreso con logo y sin "Nooki", usuarios, Ajustes, mapa de módulos por rol y las 16 pantallas de la vista previa sin errores ni bloqueos de seguridad; capturas en `capturas/app/`).
- **Inicio = mapa de módulos** (`MODULOS` en `app/app.js`): cada módulo con su estado (**Conectado** = datos reales; **Vista previa** = abre `/vista-previa/#<pantalla>` en otra pestaña) y filtrado por rol. Admin ve 19, recepción 18 (sin Usuarios), **dueño 10**: Resumen del día, Panel, Timeline, Reservas, Limpieza, Ventas, Caja, Cierre del día, Reportes y Auditoría (solo lectura). Al conectar un módulo: poner `conectado: true` y agregarlo a `VISTAS` en `app/app.js`.
- **Vista previa** (`app/vista-previa/index.html`): **copia generada** del prototipo con `noindex`. No editarla: editar `prototipo/` y volver a copiar con `python3 pruebas/copiar_vista_previa.py`. Datos de ejemplo, nada se guarda. Es pública para quien tenga el enlace (no tiene datos reales). Tiene su propia CSP en `app/_headers` (`! Content-Security-Policy` y una que permite el código dentro de la página); el resto del sitio mantiene la estricta. Verificado con `wrangler dev`.
- La red de las sesiones de Claude en la nube no llega a `*.supabase.co`: se trabaja con el conector y las pruebas de pantallas simulan Supabase.
- 31/10/2026: cuenta **oficinavirtual@nooki.pe** creada en Authentication; quedó `admin` sola (disparador) y entró a `selvainn.nooki.pe` (primera prueba real de punta a punta: ingreso + rol).
- Siguiente: desde la app crear las cuentas de recepción y del dueño. Publicado en Cloudflare el 31/10/2026 (Worker `nooki-hotel-selva-inn`, primer build verde; se despliega solo con cada push a `main`) en `selvainn.nooki.pe` (paso 6, adelantado). La red de las sesiones de Claude tampoco llega a `nooki.pe`: Raúl revisa el sitio en su navegador. Luego paso 3 (Edge Functions `facturar`, `nooki-aviso`, `nooki-estado`) y paso 4 (resto de pantallas).
- **01/11/2026 · Ajustes conectado (parte 1)**: los datos los carga **el propio hotel** desde Ajustes (no Claude). Pestañas: **Datos del hotel** (nombre, razón social, RUC, dirección, teléfono, correo; Facturación: Amazonía, IGV solo si no es Amazonía, comprobante del adelanto, impresión; Horarios), **Pisos y habitaciones** (agrupadas por piso con conteo por tipo, color por estado de hoy: libre / ocupada / reservada hoy / fuera de venta; **piso "Lleno"** cuando no queda ninguna libre; agregar "501 a 510" con piso automático; editar tipo, piso, fuera de venta y notas; eliminar solo si nunca tuvo reservas), **Tipos y tarifas** (agregar, editar, eliminar si no tiene habitaciones; el código se genera del nombre) y **Clave de administrador** (crear o cambiar; el admin no necesita la anterior). Recepción entra con la clave (candado, 10 min, botón Bloquear, se renueva al guardar); admin sin clave; dueño no ve Ajustes. Piso 0 = "Otros espacios" (auditorio).
- **Inicio: "Ocupación por piso · hoy"** para los tres roles: por piso, habitaciones por tipo, ocupadas y reservadas de hoy (hora de Lima), barra y **Lleno** en rojo. Se calcula con `reservas` (`entrada <= hoy < salida`, estados reservado/confirmado/ocupado); hasta conectar Reservas (parte 2) sale todo libre.
- Regla: **no escribir estilos dentro del HTML** (`style="..."`): la CSP los bloquea en el sitio publicado. Poner tamaños por código (`el.style.width = ...`) o con clases. Las pruebas fallan si la CSP bloquea algo.
- Pruebas de la app: **149** (`node pruebas/pruebas_app.js`); el Supabase simulado ahora entiende tablas (filtros, orden, insertar, editar, borrar con llaves foráneas), RLS de Ajustes y las funciones de la clave. Las mismas operaciones se probaron en la base real con un bloque que se deshace (13/13).
- **01/11/2026 · Operación conectada (partes 2 a 4)**. La app está en varios archivos (sin compilación) que se cargan en orden en `app/index.html`: `app.js` (núcleo: ingreso, menú, Inicio, Ajustes, Usuarios y la API `window.HS` para los módulos), `reservas.js`, `caja.js`, `ventas.js`, `operacion.js`. Cada módulo se registra con `HS.vista(k, {l, roles, render, orden, menu, padre})` y `HS.conectar(k)`; pestañas extra de Ajustes con `HS.pestanaAjustes`. Acciones delicadas con `HS.conClave(motivo, fn)` (ventana de clave para recepción; admin pasa directo).
  - **Panel** (`#panel`): indicadores del día, pisos con Lleno, habitación con huésped y estado (libre, llega hoy, ocupada, sale hoy, por limpiar, fuera de venta). Tocar una libre abre Nueva reserva con esa habitación; una con reserva abre su ficha.
  - **Nueva reserva** (`#nueva`): cliente (buscar por documento/nombre o crear; avisa "no grato"), fechas, personas, habitaciones libres reales (consulta de cruces) con varias a la vez, precio por noche con **temporadas** y fin de semana, cambiar precio con clave, origen, motivo, estado.
  - **Reservas** (`#reservas`) con filtros (activas, llegan hoy, salen hoy, finalizadas, anuladas) y búsqueda; **Clientes** (`#clientes`) con no grato.
  - **Ficha** (`#reserva/<id>`): confirmar, check-in, consumos (de Productos o libres; quitar con clave), cobrar (forma de pago; boleta/factura/nota de venta; efectivo exige caja abierta; adelanto si aún no entra), cambiar precio y anular con clave, check-out (avisa saldo, adelanta la salida si se va antes, manda la habitación a Limpieza). Pagos sin comprobante muestran "Emitir comprobante".
  - **Caja** (`#caja`): abrir con monto inicial, cobros del turno por forma de pago, ingresos/salidas, "debe haber", cierre con arqueo (cuadra/falta/sobra) e historial. Los cobros en efectivo se suman por `pagos.turno_id`.
  - **Ventas** (`#ventas`): comprobantes por período, total válido, PDF, WhatsApp (`wa.me` con el `pdf_publico`), consultar, reenviar y anular (con clave).
  - **Limpieza** (`#limpieza`): por limpiar → limpiando → por revisar → lista, asignar camarera (Personal), mandar a limpiar (repaso/retoque), listas de hoy.
  - **Reportes** (`#reportes`): período (hoy, 7 días, este mes, mes anterior, fechas): ocupación por día, cobros por forma de pago, comprobantes, reservas por origen, huéspedes por nacionalidad (MINCETUR). Descarga **CSV con `;` y BOM** (Excel en español lo abre bien); "Descargar todos". El .xlsx real del prototipo queda pendiente.
  - **Auditoría** (`#auditoria`): últimos 300 registros, filtros por módulo y tipo (con clave, alertas, SUNAT); recepción necesita la clave.
  - **Ajustes** suma: Personal, Productos, Temporadas, Formas de pago, Orígenes, Motivos de caja (tablas simples con `crud()` en `operacion.js`), y "Conexión con el facturador" (Probar conexión; admin: Activar avisos de SUNAT).
- **Facturación (Edge Functions publicadas)**: `facturar` (`verify_jwt`; acciones `emitir` por pago con `Idempotency-Key hotel:pago:<id>`, ítem de hospedaje `ZZ` con `tip_afe_igv 20` por Amazonía; `nota_venta` numerada con `siguiente_numero_interno`; `consultar`, `reenviar`, `anular` (pide clave abierta o admin), `probar` (GET /v1/empresa y /v1/series), `configurar_aviso` (PUT /v1/webhook)) y `nooki-aviso` (`verify_jwt = false`, firma HMAC, 5 min, sin repetir por `Nooki-Entrega`). Sin llaves, el comprobante queda en **Error** con "Falta configurar la conexión con el facturador" y se reenvía después desde Ventas. **Pendiente: nota de crédito** desde Ventas, facturar consumos detallados (hoy el ítem es el monto del pago) y pagos del restaurante.
- Pruebas: **217** (`node pruebas/pruebas_app.js`) con un día completo del hotel (personal, panel, nueva reserva, check-in, consumo, cobro, caja con arqueo, ventas, check-out, limpieza, anular, reportes con descarga, auditoría) y permisos por rol. Mismo recorrido en la base real con bloque que se deshace (15/15).
- **01/11/2026 · Segunda tanda (`app/mas.js`)**: **Restaurante** (`#restaurante`, `#mesa/<id>`: mesas por ambiente, carta por categoría desde Productos con "Se vende en el restaurante", pedido con +/−, comanda separada Cocina/Barra (en pantalla; impresión directa pendiente del puente), precuenta, cobrar con boleta/factura/nota de venta, cargar a la habitación como consumos, anular con clave), **Almacén** (`#almacen`: stock, mínimo, vencimientos, entradas con guía/costo/lote/vence, salidas; las ventas del restaurante y los cargos descuentan solos con `movimientos_stock`), **Cierre del día** (`#cierre`: llegadas sin check-in, salidas pendientes, limpieza, comprobantes por revisar, caja abierta; guarda `cierres` una vez por día), **Timeline** (`#timeline`: mes por habitación, tocar libre = nueva reserva con esa habitación y fecha vía `HS.nuevaReserva`), **Resumen del día** en Inicio (ocupación esta noche, llegan, salen, cobrado hoy, por cobrar en casa). Productos suma stock mínimo, restaurante y destino de comanda.
- `facturar` v2: también factura **pagos del restaurante** (un ítem por producto, unidad del producto) y emite **notas de crédito** (`nota_credito`: motivos 01, 02, 06; series BC01/FC01; `Idempotency-Key hotel:nc:<id>`; pide clave). Ventas tiene el botón "Nota de crédito".
- **Respaldo diario** (`.github/workflows/respaldo-diario.yml`): `pg_dump` de `public` y `auth` a las 03:17 de Lima, guardado 30 días como artifact privado del repo; también mantiene activo el proyecto gratis. Necesita el secreto de GitHub **`SUPABASE_DB_URL`** (lo pone Raúl; sin él solo deja un aviso). El respaldo tiene datos personales: solo para Raúl.
- Pruebas: **251**. Quedan fuera (necesitan algo externo): **WhatsApp** (cuenta de WhatsApp Business/Meta), **impresión directa** de tickets y comandas (puente en la PC de recepción; mientras tanto el PDF de Nooki se imprime desde el navegador), **tarjetas ZKTeco** (SDK del distribuidor), **modo sin internet** (cola local, por confirmar), **Excel .xlsx** real (hoy CSV).
- Datos del hotel por confirmar: razón social y RUC (los carga el hotel en Ajustes, no por chat), política de adelantos, nombres reales de los tipos (el hotel los cambia en Ajustes → Tipos y tarifas), lista real de habitaciones.

## 11. Skills de Claude en este repositorio

- **`ui-ux-pro-max`** (en `.claude/skills/ui-ux-pro-max/`): base local de estilos, colores, tipografías y reglas de UX/accesibilidad para diseñar pantallas. Copiada de `nextlevelbuilder/ui-ux-pro-max-skill` (versión 2.15.0, commit `bf41cbc`, licencia MIT, sin conexión a internet). Se usa así: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain ux` (el SKILL.md habla de `${CLAUDE_PLUGIN_ROOT}`; aquí la ruta es la de arriba).
- Sus resultados son **sugerencias**: el estilo ya decidido del sistema (sección 5: Geist, azul cobalto `#2448c7`, botones de 44–58 px, colores por estado) manda sobre lo que recomiende la skill. No usar `--persist` sin pedirlo Raúl.
