# Voranix Overlay

Proyecto para overlays de stream de la comunidad Voranix con:

- API Node.js para configuracion por canal
- login real con Twitch para streamers y admins
- comandos de chat via Twitch
- overlay web con logo y sponsor siempre visibles
- dashboard Angular para editar branding, sponsors y comandos
- base de datos SQLite para pocos streamers

## Estructura

- `backend/`: API Express + Socket.IO + bot de Twitch
- `overlay/`: visual del overlay para usar como Browser Source
- `dashboard-angular/`: panel Angular para streamers/admins

## Backend

```bash
cd backend
npm install
npm run dev
```

Variables esperadas en `.env`:

```env
PORT=3000
TWITCH_BOT_USERNAME=tu_bot
TWITCH_OAUTH=oauth:xxxxx
TWITCH_CHANNEL=voranix
TWITCH_CLIENT_ID=tu_client_id
TWITCH_CLIENT_SECRET=tu_client_secret
TWITCH_REDIRECT_URI=http://localhost:3000/api/auth/twitch/callback
ADMIN_TWITCH_LOGINS=tu_login_admin,otro_admin
DASHBOARD_URL=http://localhost:4200
DATABASE_PATH=C:\\ruta\\fuera-de-onedrive\\voranix.sqlite
```

`DATABASE_PATH` es importante en Windows si el proyecto vive dentro de OneDrive. Si no lo defines, la app intentara usar `%LOCALAPPDATA%\\VoranixOverlay\\voranix.sqlite`.

Tambien tienes un ejemplo listo en `backend/.env.example`.

Notas de acceso:

- `streamer`: puede editar su propio canal, branding y comandos
- `admin`: puede editar cualquier canal y tambien patrocinadores

## Overlay

Browser Source para OBS:

```text
http://localhost:3000/overlay/?channel=voranix
```

En produccion:

```text
https://tu-api-en-render.onrender.com/overlay/?channel=voranix
```

## Dashboard Angular

```bash
cd dashboard-angular
npm install
npm start
```

Desde el dashboard puedes:

- iniciar sesion con Twitch
- cargar un canal
- cambiar branding
- editar sponsors
- configurar comandos
- disparar pruebas sin Twitch

## Render

Despliega primero `backend/` como Web Service en Render.

- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: `backend`

Para SQLite en Render, apunta `DATABASE_PATH` a un disco persistente, por ejemplo:

```env
DATABASE_PATH=/var/data/voranix.sqlite
```

Tambien puedes desplegar ambos servicios automaticamente con `render.yaml` en la raiz del proyecto:

- `voranix-overlay-api`: API + overlay + bot + SQLite persistente
- `voranix-overlay-dashboard`: dashboard Angular estatico

Flujo recomendado en Render:

1. Crea los servicios desde `render.yaml`.
2. En Twitch Developers registra el redirect exacto del backend:
   `https://voranix-overlay-api.onrender.com/api/auth/twitch/callback`
3. Completa en Render los secretos marcados con `sync: false`.
4. Abre el dashboard, configura la `API base` y guárdala.
5. Usa en OBS la URL:
   `https://voranix-overlay-api.onrender.com/overlay/?channel=voranix`

Si luego quieres subir el dashboard por separado:

- Build Command: `npm install && npm run build`
- Publish Directory: `dist/dashboard-angular/browser`
