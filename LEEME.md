# Asistente de chat — AZZAO

Un chat que se pega en azzao.com con una sola línea de código. Cuenta de qué se
trata la churrasquera, responde dudas, y —lo más importante mientras el producto
está en *próximamente*— **deja registrados los datos de quien se interesa**, para
avisarle cuando abra la venta.

No necesita Meta, ni WhatsApp Business, ni trámites de verificación.

---

## Qué hay en la carpeta

- `data/negocio.md` — **el archivo que más va a tocar.** Ahí vive todo lo que el
  bot sabe: producto, beneficios, precios, envíos, contacto. Se edita como un
  texto normal y el bot toma los cambios al reiniciar.
- `public/widget.js` — el chat que se pega en la página, con los colores y las
  tipografías del manual de marca.
- `public/index.html` — página de prueba para ver el chat antes de instalarlo.
- `src/` — el servidor y el motor de respuestas.
- `data/lista_de_espera.csv` — se crea solo; ahí caen los interesados.
- `data/intenciones_de_compra.csv` — quienes quieren comprar ya.
- `data/casos_para_asesor.csv` — lo que necesita atención humana.

---

## Antes de nada: complete `data/negocio.md`

Armé ese archivo con todo lo que saqué del manual de marca: el concepto, los tres
beneficios, el tono, el perfil del cliente. Pero hay datos comerciales que solo
usted tiene, y quedaron marcados como **PENDIENTE**:

Precio, fecha de lanzamiento, medidas y potencia, capacidad (para cuántas
personas), qué incluye la caja, garantía, envíos, formas de pago y los datos de
contacto.

Mientras digan PENDIENTE, el bot responde que todavía no tiene ese dato y
aprovecha para pedir el correo. Eso es a propósito y funciona sorprendentemente
bien en preventa: es honesto y convierte la duda en un registro.

Lo que **sí** puede responder ya, porque está en el manual: qué es AZZAO, para
quién es, por qué sirve en un apartamento, qué problema resuelve, y consejo
general de asado.

---

## El cerebro: gratis o de pago

El bot puede pensar con dos motores distintos. Se elige con una variable, sin
tocar código.

**Gemini, de Google. Gratis.** No pide tarjeta de crédito. Le dan 1.500
consultas al día, que para un sitio que arranca sobra. La llave se saca en
<https://aistudio.google.com/apikey> en menos de un minuto. El único pero, y
es importante que lo sepa: en el plan gratuito **Google puede usar las
conversaciones para entrenar sus modelos**, y esas conversaciones incluyen
nombres y correos de sus clientes.

**Claude, de Anthropic. De pago.** Mínimo cinco dólares de recarga. Responde
mejor y con más matiz, y no usa sus datos para entrenar. Es a lo que conviene
migrar cuando el producto ya esté vendiendo.

Empiece con Gemini. Cambiar después es modificar dos líneas del `.env`.

## Dónde quedan los interesados

Esto importa más de lo que parece: **en los hostings gratuitos el disco se
borra solo**, cada despliegue o cada vez que el servicio se duerme. Si los
datos solo viven ahí, usted pierde los interesados sin enterarse.

Por eso el bot puede mandar cada registro a una **hoja de Google**, que es
gratis y no se borra nunca. El archivo `hoja-de-google.gs` trae las
instrucciones paso a paso; toma unos cinco minutos.

Hágalo. Es la diferencia entre tener su lista de espera o perderla.

## Paso 1 — Verlo funcionando (15 minutos)

Necesita [Node.js](https://nodejs.org) versión 20 o superior.

1. Abra una terminal en esta carpeta:

   ```
   npm install
   ```

2. Copie `.env.example` y renómbrelo a `.env`.

3. Saque su llave gratuita en <https://aistudio.google.com/apikey> y péguela
   en `.env`, en `GEMINI_API_KEY=`. Deje `PROVEEDOR=gemini`.

4. Arranque:

   ```
   npm start
   ```

   Al arrancar le dice qué cerebro está usando y dónde guarda los registros.
   Léalo: ahí se ve de una si algo quedó mal configurado.

5. Abra <http://localhost:3000>. Abajo a la derecha está la llama: ahí vive el chat.

### Qué probar

Pregúntele cómo funciona, si sirve en un apartamento, si hace humo, cuánto vale
(no debe inventar precio), y cuándo sale. Déjele un nombre y un correo y revise
que aparezca en `data/lista_de_espera.csv`. Achique la ventana al ancho de un
celular para ver que el chat ocupe toda la pantalla.

**Acá es donde vale la pena invertir tiempo.** Si responde muy formal, muy largo,
o pide el correo demasiado pronto, se corrige editando las reglas al final de
`data/negocio.md` y las instrucciones en `src/cerebro.js`. Iterar en esta etapa
no cuesta casi nada y es lo que separa un bot que da pena de uno que vende.

---

## Paso 2 — Subirlo a Railway

El chat necesita un servidor accesible desde la web. Acá va el camino completo
con Railway, que es el más sencillo para este proyecto.

### 2.1 Subir el código a GitHub

Railway despliega desde GitHub. Si no tiene cuenta, créela en github.com.

1. En GitHub, botón **New repository**. Nómbrelo `chat-azzao` y márquelo
   **Private**. Créelo sin README.
2. En su computador, dentro de la carpeta del proyecto:

   ```
   git init
   git add .
   git commit -m "Chat de AZZAO"
   git branch -M main
   git remote add origin https://github.com/SU-USUARIO/chat-azzao.git
   git push -u origin main
   ```

El archivo `.gitignore` ya está puesto para que **nunca** se suba el `.env` con
sus llaves ni la carpeta de registros. Verifique en GitHub que no aparezca el
`.env`; si aparece, bórrelo y cambie la llave de Claude de inmediato.

### 2.2 Crear el servicio en Railway

1. Entre a [railway.app](https://railway.app) con su cuenta de GitHub.
2. **New Project → Deploy from GitHub repo →** elija `chat-azzao`.
3. Railway detecta Node.js solo y arranca el despliegue. Va a fallar o quedar
   en pie sin responder hasta que ponga las variables; es normal.

### 2.3 El volumen (no se lo salte)

En Railway el disco se borra en cada despliegue. Sin un volumen, **cada
actualización del bot se lleva la lista de espera**.

1. En el proyecto, clic derecho sobre el canvas (o `⌘K`) → **New Volume**.
2. Conéctelo al servicio del bot.
3. En **Mount path** escriba exactamente: `/app/registros`

### 2.4 Las variables

En el servicio → pestaña **Variables** → **Raw Editor**, pegue esto y ajústelo:

```
PROVEEDOR=gemini
GEMINI_API_KEY=la-suya-de-aistudio
GEMINI_MODELO=gemini-2.5-flash
HOJA_WEBHOOK=la-url-de-su-apps-script
NODE_ENV=production
REGISTROS_DIR=/app/registros
CLAVE_ADMIN=invente-una-clave-larga-aqui
DOMINIOS_PERMITIDOS=https://azzao.com,https://www.azzao.com
LIMITE_MENSAJES_HORA=40
```

No ponga `PORT`: Railway lo asigna solo.

Si más adelante pasa a Claude, cambie `PROVEEDOR=claude` y agregue
`ANTHROPIC_API_KEY`. Nada más.

### 2.5 El dominio

1. Servicio → **Settings → Networking → Generate Domain**. Le da una dirección
   tipo `chat-azzao-production.up.railway.app`. Con eso ya puede probar.
2. Para dejarlo en `chat.azzao.com`: **Custom Domain →** escriba
   `chat.azzao.com`. Railway le muestra un registro CNAME que hay que crear en
   el panel donde administra el dominio azzao.com. Tarda unos minutos en quedar
   activo, y el certificado https lo pone Railway solo.

### 2.6 Comprobar que quedó bien

Abra en el navegador:

```
https://chat.azzao.com/salud
```

Debe responder algo así:

```json
{"estado":"ok","cerebro":"gemini","modelo":"gemini-2.5-flash",
 "hojaDeGoogle":true,"registrosPersistentes":true,
 "dominiosPermitidos":["https://azzao.com","https://www.azzao.com"]}
```

Revise dos cosas. Si `cerebro` dice `"ninguno"`, falta la llave y el bot no va a
responder. Y si `registrosPersistentes` dice `false` **y** `hojaDeGoogle` también
dice `false`, va a perder los interesados: configure al menos una de las dos.

Después abra `https://chat.azzao.com` a secas: debe ver la página de prueba con
la burbuja funcionando.

### Cómo actualizar el bot después

Cambia lo que necesite en su computador, y:

```
git add .
git commit -m "Actualizo los datos del producto"
git push
```

Railway lo despliega solo en un par de minutos. Los registros sobreviven gracias
al volumen.

### Alternativa sin GitHub

Si prefiere no usar GitHub, instale el CLI (`npm i -g @railway/cli`) y desde la
carpeta del proyecto ejecute `railway login`, luego `railway init` y
`railway up`. El volumen y las variables se configuran igual desde el panel.

---

## Paso 3 — Pegarlo en azzao.com

Una sola línea, antes de `</body>`:

```html
<script src="https://chat.azzao.com/widget.js"
        data-api="https://chat.azzao.com"></script>
```

Reemplace `chat.azzao.com` por la dirección real donde quedó el bot.

**Si el sitio es WordPress**: instale el plugin *WPCode* o *Insert Headers and
Footers*, y pegue esa línea en el campo del footer. Si usa Elementor, también
sirve un widget de HTML en el pie de página de la plantilla.

**Si es Shopify, Wix o Squarespace**: todos tienen un campo de "código
personalizado" o "custom code" en la configuración del sitio. Ahí va.

### Autorizar su dominio

En el `.env` del servidor, ponga:

```
DOMINIOS_PERMITIDOS=https://azzao.com,https://www.azzao.com
```

Sin eso, cualquier página de internet podría usar su chat y gastarle la cuenta de
Claude. Con eso, solo azzao.com puede.

### Opciones del widget

Todas son opcionales:

```html
<script src="https://chat.azzao.com/widget.js"
        data-api="https://chat.azzao.com"
        data-saludo="Su mensaje de bienvenida"
        data-invitacion="El texto del globito que aparece a los 6 segundos"
        data-posicion="izquierda"></script>
```

Para abrir el chat desde un botón propio de la página:

```html
<button onclick="window.AzzaoChat.abrir()">Hablar con nosotros</button>
```

---

## Cómo se mantiene

**Actualizar el contenido**: edite `data/negocio.md` y reinicie. Cuando defina el
precio y la fecha de lanzamiento, reemplace los PENDIENTE y el bot empieza a
darlos de inmediato. No hay que tocar código.

**Ver los interesados**: en su computador están en `registros/lista_de_espera.csv`,
se abre en Excel. Cuando el bot ya esté en Railway, el disco no lo puede abrir,
así que se descargan desde el navegador:

```
https://chat.azzao.com/registros/lista-de-espera?clave=SU-CLAVE-ADMIN
```

También existen `intenciones`, `casos` y `conversaciones` en esa misma ruta.
La clave es la que puso en `CLAVE_ADMIN`; guárdela bien y no la comparta, porque
con ella se bajan los datos de sus clientes.

**Revisar cómo va conversando**: el archivo de conversaciones guarda cada mensaje.
Léalo de vez en cuando: ahí se ve qué pregunta la gente de verdad, y eso le dice
qué agregarle al `negocio.md`.

---

## Cuidados

El chat queda expuesto a internet, así que trae dos protecciones puestas: solo
responde a los dominios que usted autorice, y limita a 40 mensajes por hora desde
una misma conexión. Ese límite se ajusta con `LIMITE_MENSAJES_HORA` en el `.env`.

Póngale tope de gasto a la llave de Claude en la consola de Anthropic. Es un
minuto de trabajo y evita sorpresas.

---

## Límites de esta versión

- No lee fotos que mande el visitante.
- La memoria de cada conversación vive en el servidor: si se reinicia, las charlas
  en curso arrancan de cero. El visitante mantiene su identificador, eso sí.
- Los interesados quedan en un CSV, no en un CRM. Conectarlo a una hoja de Google
  o a un correo automático es un paso pequeño si lo necesita.
- No hay tablero web para ver los registros.

---

## Si algo falla

**El chat no responde** — revise que `ANTHROPIC_API_KEY` esté bien puesta y que
tenga saldo en la consola de Anthropic.

**Dice "Dominio no autorizado"** — el dominio desde donde se abre la página no
está en `DOMINIOS_PERMITIDOS`. Revise que esté con `https://` y sin barra final.

**La burbuja no aparece** — abra la consola del navegador (F12) y mire si hay un
error. Lo más común es que `data-api` apunte a una dirección equivocada.

**Inventa datos** — falta información en `data/negocio.md`. Agregue el dato y
reinicie.
