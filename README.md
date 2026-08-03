# Email Manager Pro

Add-in de Outlook para llevar notas, estados, proyecto y responsable sobre cada correo, con
sincronización a SharePoint.

## Puesta en marcha

### 1. Rotar los flows de Power Automate (obligatorio, una sola vez)

Las URLs anteriores estuvieron publicadas en este repo público con su firma `sig`, así que hay
que darlas por comprometidas.

En cada uno de los dos flows (lectura de proyectos y escritura de seguimiento):

1. Abre el flow → trigger **When an HTTP request is received**.
2. Regenera la URL (quitar y volver a añadir el trigger, o usar *Regenerate* si tu entorno lo
   ofrece). La URL nueva trae un `sig` nuevo y la vieja deja de funcionar.
3. Si el entorno lo permite, pon el trigger en **Any user in my tenant** en vez de anónimo.

No pegues las URLs nuevas en ningún archivo del repo. Van directo a Vercel en el paso 3.

### 2. Reusar el Supabase de CCP

No hay que crear usuarios: este add-in usa **el mismo proyecto de Supabase que CCP**, con las
mismas cuentas y la misma tabla `user_roles`. Quien ya entra a CCP entra aquí con lo mismo.

De **Settings → API** del proyecto saca el **Project URL** y la **anon public key** (son las que
ya están en `auth.js` de CCP; la anon key es pública por diseño).

El add-in solo *lee* `user_roles` para saber el `display_name` y el rol de quien firma las notas.
No escribe nada en Supabase.

### 3. Desplegar en Vercel

```bash
npx vercel link
npx vercel env add FLOW_READ_URL production
npx vercel env add FLOW_WRITE_URL production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_ANON_KEY production
npx vercel deploy --prod
```

Repite los `env add` para `preview` si vas a usar despliegues de preview.

Si el dominio que asigna Vercel no es `email-manager-pro.vercel.app`, actualiza las seis URLs
de `public/manifest.xml` antes de repartirlo.

### 4. Verificar que quedó protegido

Abre `https://TU-DOMINIO/sp-test.html`:

- El botón **3. Probar sin token** debe responder **401**. Si responde 200, los endpoints están
  abiertos: no repartas el add-in.
- Inicia sesión y prueba **1. Leer proyectos** y **2. Escribir fila de prueba**.

### 5. Instalar el add-in

Carga `public/manifest.xml` en Outlook (sideload). Cada persona entra una vez en la pestaña
**⚙ Config** con su usuario de CCP; la sesión se renueva sola y las notas se firman con su
`display_name`.

## Cómo está protegido

El taskpane es público — Outlook tiene que poder descargarlo — así que **nada secreto puede
vivir en el cliente**. Las URLs de los flows quedan como variables de entorno en Vercel, y el
navegador solo habla con `/api/projects` y `/api/sync`, que exigen un token de Supabase válido
antes de tocar Power Automate.

```
Outlook taskpane  ──token Supabase──>  Vercel Functions  ──sig secreto──>  Power Automate  ──>  SharePoint
   (público)                             (env vars)                          (privado)
```

## Desarrollo

```bash
npx vercel dev
```

Sirve estáticos y funciones juntos. Necesita un `.env` local con las mismas variables
(`.env.example` tiene la plantilla; `.env` está en `.gitignore`).
