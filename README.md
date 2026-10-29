# BIN Checker para Telegram + Vercel

Bot en **Node.js 24**, sin dependencias de producción, para consultar únicamente los **primeros 6 u 8 dígitos** (BIN/IIN) de una tarjeta. Informa franquicia, tipo, banco, país, moneda y **nivel/categoría cuando esté disponible en el proveedor**. No valida tarjetas, saldos, CVV, fecha de vencimiento, compras ni estado de las cuentas.

## Qué incluye

- `api/telegram.js`: función HTTP para el webhook de Telegram.
- `api/health.js`: comprobación simple del servidor.
- `src/bin-client.js`: consulta a BINTable, VeriSec (test) o Binlist.
- `src/bot.js`: comandos, validación y presentación de resultados.
- `src/webhook.js`: comprueba secreto del webhook y construye la respuesta a Telegram.
- `scripts/setup-webhook.js`: configura el webhook y los comandos de Telegram.
- `scripts/dev.js`: servidor HTTP local para probar con PowerShell o curl.
- `test/*.test.js`: pruebas automatizadas sin llamadas ni claves reales.

## Proveedores y campo de nivel

| `BIN_PROVIDER` | Nivel / categoría | Clave | Nota |
| --- | --- | --- | --- |
| `bintable` | `data.card.category` | `BINTABLE_API_KEY` | **Recomendado para consultas reales**. BINTable requiere una cuenta; al momento de redactar esta guía anuncia 100 consultas gratuitas el primer mes. |
| `verisec` | `level` | `VERISEC_API_KEY` | **Solo pruebas**: su documentación indica que las credenciales de producción todavía no están disponibles. No confundir los resultados de test con información verificada. |
| `binlist` | No ofrece un campo de nivel fiable | Sin clave | Básico y muy limitado: el sitio indica 5 consultas/hora. |
| `demo` | Ficticio | Sin clave | Exclusivamente local, con `999999`. **Está bloqueado en Vercel**. |

**Importante**: la categoría del producto puede ser `Classic`, `Gold`, `Platinum`, `Corporate`, etc. No todos los BIN poseen una categoría determinada, y la categoría puede no corresponder al nivel comercial actual de la tarjeta física. El bot no deduce el nivel a partir de la numeración o de un nombre de marca.

Documentación oficial de proveedores:
- https://bintable.com/get-api
- https://docs.verisec.dev/docs/api/bin/
- https://docs.verisec.dev/docs/authentication/
- https://binlist.net/

## Requisitos

1. **Node.js 24** instalado en Windows (verifica con `node -v`).
2. Cuenta de Telegram y bot creado con **@BotFather**. Copia su token y **no lo publiques**.
3. Una clave de **BINTable** si quieres nivel/categoría real: https://bintable.com/get-api.
4. Cuenta en Vercel y, opcionalmente, Vercel CLI.

## 1. Preparar en Windows / PowerShell

Descomprime el ZIP y entra a la carpeta en PowerShell:

```powershell
cd C:\ruta\bin-checker-telegram
Copy-Item .env.example .env
```

Genera una clave aleatoria para el webhook (guárdala):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Abre `.env` en un editor y rellena estas variables:

```dotenv
TELEGRAM_BOT_TOKEN=TU_TOKEN_DE_BOTFATHER
TELEGRAM_WEBHOOK_SECRET=UN_SECRETO_ALEATORIO_GENERADO
BIN_PROVIDER=bintable
BINTABLE_API_KEY=TU_API_KEY_DE_BINTABLE
ALLOWED_USER_IDS=
PUBLIC_URL=https://TU-PROYECTO.vercel.app
PORT=3000
```

**Privacidad / control de gastos**: Para que solo determinadas personas puedan hacer consultas, usa `ALLOWED_USER_IDS=123456789,987654321`. El comando `/id` muestra el ID personal de quien lo envía, incluso antes de ser autorizado. Si dejas la variable vacía, cualquier persona con acceso al bot puede consumir tu cuota de consultas. El límite de gasto/cupo se administra también desde el proveedor.

## 2. Probar sin Telegram ni gastar créditos

El proyecto incluye 14 pruebas que simulan respuestas del proveedor. Ejecútalas:

```powershell
npm test
npm run check
```

Para probar la función local, modifica temporalmente `.env` a `BIN_PROVIDER=demo` y ejecuta:

```powershell
npm run dev
```

En otra ventana PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Para simular un mensaje del bot sin usar datos bancarios (cambia `TU_SECRETO` por el mismo secreto de `.env`):

```powershell
$headers = @{ 'X-Telegram-Bot-Api-Secret-Token' = 'TU_SECRETO' }
$body = @{
  message = @{
    message_id = 8
    text = '/bin 999999'
    chat = @{ id = 123; type = 'private' }
    from = @{ id = 123; is_bot = $false }
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/telegram' -ContentType 'application/json' -Headers $headers -Body $body
```

La respuesta debe contener `method: sendMessage` y un resultado **claramente marcado como simulado**. Luego vuelve a poner `BIN_PROVIDER=bintable` para producción.

## 3. Desplegar en Vercel

Puedes subir este proyecto desde un repositorio a **Vercel Dashboard** (Import Project) o hacerlo con la consola:

```powershell
npm install -g vercel
vercel login
vercel
```

Al primer despliegue, asigna un nombre al proyecto. En **Vercel → proyecto → Settings → Environment Variables** configura para el entorno **Production**:

| Variable | Valor |
| --- | --- |
| `TELEGRAM_WEBHOOK_SECRET` | El **mismo secreto** configurado en `.env`. |
| `BIN_PROVIDER` | `bintable` |
| `BINTABLE_API_KEY` | Tu clave privada de BINTable. |
| `ALLOWED_USER_IDS` | Opcional pero recomendado: tus IDs de Telegram separados por comas. |

El token `TELEGRAM_BOT_TOKEN` se usa en el comando local `npm run webhook` para registrar el webhook; **la función publicada no lo necesita**. Tampoco requiere `PUBLIC_URL` en Vercel. Las variables son privadas: **no las subas a GitHub**, no pegues claves en el código y no publiques `.env`.

Después de guardar las variables, ejecuta:

```powershell
vercel --prod
```

Vercel te devuelve tu dominio de producción (por ejemplo `https://mi-bin-checker.vercel.app`). Abre esta URL para verificar:

```
https://TU-PROYECTO.vercel.app/api/health
```

Debe devolver `{"ok":true,...}`. Si ves un 404, verifica que la carpeta `api/` esté en la raíz del proyecto.

## 4. Conectar Telegram al dominio de Vercel

En tu `.env` local, pon tu URL de producción exacta:

```dotenv
PUBLIC_URL=https://TU-PROYECTO.vercel.app
```

Y ejecuta en PowerShell:

```powershell
npm run webhook
```

El script registra `https://TU-PROYECTO.vercel.app/api/telegram` mediante `setWebhook`, incluye el `secret_token` y crea los comandos con `setMyCommands`. **No uses una URL de preview que cambia en cada despliegue**. Telegram enviará cada actualización como HTTPS POST y el bot le responderá a través de la respuesta del webhook.

Ahora abre tu bot en Telegram y escribe:

```text
/start
/id
/bin 123456
/bin 12345678
```

Reemplaza `123456` por el BIN público que deseas consultar. El resultado depende del registro encontrado en el proveedor.

## Ejemplo del formato de salida (ficticio)

```text
💳 CONSULTA BIN / IIN

🔢 BIN: 123456
💳 Franquicia: Visa
⭐ Nivel / categoría: Platinum
💰 Tipo: Crédito
🏦 Banco emisor: Banco de ejemplo
🌎 País: 🇨🇴 Colombia
💱 Moneda: COP

📚 Fuente: BINTable
ℹ️ Son metadatos orientativos del BIN, no una verificación de la tarjeta.
```

Este ejemplo no representa los datos reales de ningún BIN. Cuando el proveedor no incluya el campo `category`, aparecerá **No disponible**, no se fabricará un nivel.

## Seguridad y limitaciones

- Acepta **exclusivamente 6 u 8 dígitos numéricos** y rechaza números completos de tarjeta (PAN) antes de consultar a la API.
- Nunca solicites ni envíes CVV, fecha de expiración, PIN, saldos ni comprobaciones de funcionamiento de tarjetas.
- Compara en tiempo constante el encabezado `X-Telegram-Bot-Api-Secret-Token`; el webhook devuelve **403** sin el secreto correcto.
- `ALLOWED_USER_IDS` evita consultas de terceros; se recomienda utilizarlo con un proveedor de pago.
- No almacena BINs ni resultados y no registra el cuerpo de los webhooks. Telegram sí puede conservar mensajes conforme a sus propias políticas.
- El servidor usa `AbortSignal.timeout` para limitar a 7 segundos el tiempo de espera del proveedor. Si hay 429, error de clave, falta de cupo o 404, devuelve mensajes específicos sin exponer secretos.
- En grupos solo atiende comandos (`/bin ...`); ignora números enviados sin comando.
- Este proyecto **no incorpora un límite de peticiones distribuido** ni protección de gasto por usuario. Para un bot público con muchos usuarios añade un rate limiter persistente (por ejemplo Redis/Upstash), cuotas y monitoreo antes de abrirlo al público.
- BINTable requiere la clave en la URL por especificación de su API. El código no registra esa URL; evita habilitar logs de URL saliente con secretos.
- Telegram puede reintentar webhooks en algunos errores. En esta implementación la respuesta está integrada en el webhook; para flujos comerciales sensibles a duplicaciones añade deduplicación persistente por `update_id`.
- La exactitud depende de la base externa y de si la entidad emisora utiliza rangos de 6 u 8 dígitos con productos diferentes.

## Documentación del despliegue

- Telegram setWebhook: https://core.telegram.org/bots/api#setwebhook
- Telegram respuesta mediante webhook: https://core.telegram.org/bots/api#making-requests-when-getting-updates
- Vercel Functions (Node.js): https://vercel.com/docs/functions/runtimes/node-js
- Node.js admitido en Vercel: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

## Solución rápida de problemas

| Síntoma | Revisión |
| --- | --- |
| Telegram no responde | ¿Ejecutaste `npm run webhook` con el dominio HTTPS de **producción**? ¿Coincide `TELEGRAM_WEBHOOK_SECRET` en local y Vercel? |
| `403 Forbidden` en `/api/telegram` | Es normal desde navegador o peticiones sin el secreto de Telegram. |
| Error de clave o cupo | Verifica `BINTABLE_API_KEY` y tu balance/caducidad en el proveedor. |
| Nivel `No disponible` | El proveedor no entregó una categoría para ese BIN; prueba el prefijo de 8 dígitos si lo tienes. |
| 404 en `/api/health` | Comprueba la raíz del proyecto y el despliegue. |
| Usabas `BIN_PROVIDER=demo` en Vercel | Cambia a `bintable`, con una clave válida. DEMO está bloqueado en producción. |

**Aviso**: software educativo de consulta de datos públicos sobre rangos BIN/IIN. No sirve para comprobar si una tarjeta es válida, está activa o tiene fondos.
