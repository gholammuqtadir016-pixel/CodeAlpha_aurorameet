# ✳ Aurora Meet — Real-time collaboration, beautifully connected

**Aurora Meet** is a full-stack collaborative meeting application built with React, TypeScript, WebRTC, Socket.IO, Node.js, Express, Prisma and SQLite. Meet in real time, share a screen and files, brainstorm on a persistent whiteboard, and keep conversations together in private rooms.

> **Project scope:** A working portfolio-grade application designed for **small meeting rooms** (up to 8 connections by default). It uses a peer-to-peer mesh, not an enterprise SFU. See [Production notes](#production-notes).

## Features

- **Authentication:** sign up, sign in, securely hashed passwords, expiring JWT sessions, protected APIs and Socket.IO connections.
- **Rooms:** create and join using a shareable invite code; room-level access control.
- **Video meetings:** multi-user WebRTC video/audio; mute microphone; camera toggle; participant list; live presence.
- **Screen sharing:** share a browser tab/window/screen using `getDisplayMedia`; switch back to camera afterward.
- **Chat:** real-time room messages stored encrypted-at-rest using AES-256-GCM; loaded when the room is reopened.
- **Whiteboard:** live freehand drawing, multiple colors, eraser, clear, PNG export, saved server-side strokes.
- **File sharing:** authenticated 15 MB file uploads, shared file list, permission-checked downloads.
- **Design:** responsive dark interface with custom visual identity, clear navigation, polished empty states and forms.

## Tech stack

| Layer                       | Technology                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend                    | React 18, TypeScript, Vite 6, Lucide icons                                                                 |
| Backend                     | Node.js 20.19+ / 22 LTS, Express 4                                                                         |
| Signaling and collaboration | Socket.IO 4                                                                                                |
| Media                       | WebRTC (browser APIs, STUN; optional TURN configuration)                                                   |
| Database                    | SQLite via Prisma ORM 6.19                                                                                 |
| Authentication              | bcryptjs, JWT                                                                                              |
| Security                    | HTTPS-ready, AES-256-GCM chat-at-rest, Helmet, request validation, rate limiting, membership authorization |

## Requirements

- **Node.js 22 LTS recommended** (Node 20.19+ also works)
- npm 10 or later
- Chrome, Edge, Firefox, or another modern WebRTC-capable browser
- No paid cloud services or external database required for local development

## Windows Quick Start (PowerShell)

Open PowerShell inside the project folder:

```powershell
npm install
npm run setup
```

`npm run setup` creates local `.env` files and generates strong random secrets automatically. Existing secrets are preserved. **Never commit `.env` files.**

```powershell
npm run db:push
npm run dev
```

Open **http://localhost:5173** in your browser. Create an account and a meeting. For a second user, use another browser/profile and create a different account, then enter the room invite code.

> The first `npm run db:push` creates the local SQLite database. No Docker required.

## Commands

| Command           | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `npm run dev`     | Start frontend (5173) and backend (4000) together       |
| `npm run setup`   | Create safe local environment files with random secrets |
| `npm run db:push` | Synchronize the SQLite schema (development)             |
| `npm run build`   | Type-check and build the frontend                       |
| `npm run test`    | Run backend unit tests                                  |
| `npm run start`   | Start the API for production deployment                 |

## Configuration

Server `server/.env`:

| Environment variable | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `PORT`               | API server port (default 4000)                               |
| `CLIENT_ORIGIN`      | Allowed frontend origins separated by commas                 |
| `DATABASE_URL`       | Prisma SQLite URL, default `file:./dev.db`                   |
| `JWT_SECRET`         | A private random secret of **at least 32 characters**        |
| `ENCRYPTION_KEY`     | **Exactly 64 hexadecimal characters** for AES-256-GCM        |
| `UPLOAD_DIR`         | Directory for file uploads                                   |
| `MAX_ROOM_PEERS`     | Maximum simultaneously connected sockets per room; default 8 |

Client `client/.env`:

| Environment variable   | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `VITE_API_URL`         | Public HTTP(S) address of API server      |
| `VITE_TURN_URL`        | Optional `turn:...` or `turns:...` URL    |
| `VITE_TURN_USERNAME`   | TURN credentials for browser connectivity |
| `VITE_TURN_CREDENTIAL` | TURN credentials for browser connectivity |

## Architecture

```text
aurora-meet/
├── client/
│   ├── src/
│   │   ├── components/      # Video tiles, whiteboard, chat, files
│   │   ├── hooks/           # WebRTC + Socket.IO meeting lifecycle
│   │   ├── lib/             # HTTP client and authentication context
│   │   ├── pages.tsx        # Auth, workspace, and meeting pages
│   │   └── styles.css       # Responsive visual system
│   └── vite.config.ts
├── server/
│   ├── prisma/schema.prisma # Users, rooms, memberships, chat, files, strokes
│   └── src/
│       ├── index.js         # Express endpoints + authenticated signaling
│       ├── security.js      # Validation, tokens, AES-256-GCM
│       └── security.test.js # Unit tests
├── .github/workflows/ci.yml
└── README.md
```

**Media flow:** Browser A ↔ WebRTC ↔ Browser B (or C, D...). Socket.IO only relays connection offers, answers and ICE candidates. **Collaboration flow:** Browser → authenticated Socket.IO → room broadcast + Prisma persistence. **File flow:** Browser → permission-checked Express route → disk storage + Prisma metadata → authenticated download.

## API overview

| Endpoint                    | Action                         |
| --------------------------- | ------------------------------ |
| `POST /api/auth/register`   | Register an account            |
| `POST /api/auth/login`      | Log in                         |
| `GET /api/me`               | Get current user               |
| `GET /api/rooms`            | List joined rooms              |
| `POST /api/rooms`           | Create room                    |
| `POST /api/rooms/join`      | Join by invite code            |
| `GET /api/rooms/:id`        | Room, messages, files, strokes |
| `POST /api/rooms/:id/files` | Upload member file             |
| `GET /api/files/:id`        | Permission-checked download    |
| `GET /api/health`           | Health check                   |

Socket.IO events: `room:join`, `room:leave`, `room:presence`, `peer:signal`, `peer:media`, `chat:send`, `chat:new`, `whiteboard:stroke`, `whiteboard:clear`, `file:new`.

## How to test with two users

1. Sign in as account A in Chrome and create a room.
2. Copy the invite code shown in the meeting header.
3. Open an incognito window or a different browser, register account B, and join the code.
4. Approve media permissions and test microphone, camera and video between both windows.
5. Try whiteboard strokes, messages and file upload; verify changes appear for both users.
6. Reload the meeting: saved chat, whiteboard strokes and uploaded file metadata should remain.
7. Try accessing a room from an account that has not joined: the API should reject access.

## Production notes

- **Use two always-on services:** deploy the frontend as static assets (Vercel / Netlify) and the **Socket.IO/Express backend** on a persistent Node host (e.g. Render paid instance, Railway or a VM). A serverless Vercel function is **not** a substitute for an always-on signaling server.
- **Use HTTPS and WSS.** Browsers require secure contexts for camera and screen capture except localhost. Configure `CLIENT_ORIGIN` and `VITE_API_URL` to match production origins.
- **Configure TURN.** Public STUN-only peer connections fail behind some NATs and firewalls. Deploy or subscribe to a TURN service such as coturn and supply credentials. Static TURN credentials in `VITE_*` variables are exposed to clients; use short-lived credentials from your backend before public launch.
- **SQLite and disk uploads are single-instance.** For horizontally scaled production, move to managed PostgreSQL, object storage and Socket.IO's Redis adapter. Keep a permanent disk/database backup.
- **AES-256-GCM is encryption at rest, not end-to-end encryption.** Chat is readable by the backend during delivery. WebRTC media uses encrypted transport (DTLS-SRTP), but the app does not implement application-layer E2EE.
- **Room codes are bearer-like invites.** Possession of a code grants membership. For sensitive rooms, add invite expiry, explicit approval, moderation, and revocation.
- **Security before public release:** add malware scanning, content-type detection, shared-file quotas/retention, socket event rate limits, refresh/revocation support, observability, account recovery and integration/E2E tests.
- **Meeting limit:** mesh WebRTC scales approximately O(n²) in connection count; for large rooms and production-grade screen sharing/quality, migrate to an SFU such as LiveKit, mediasoup or Jitsi.

## Known constraints

- The app is optimized for Chrome/Edge and small groups. Browser media permissions are required.
- If both camera and microphone are denied, users can still join the room as viewers and collaborate.
- Screen sharing and ICE renegotiation can vary across browsers/network conditions; add a production SFU for high-reliability large-scale use.
- The demo does not include recording, invitations by email, moderation or true end-to-end message encryption.

## License

MIT — see `LICENSE`.

## Troubleshooting: meeting opens but camera is black

1. Use `http://localhost:5173` on the same PC, or **HTTPS** for other machines. Browsers generally block camera access on insecure remote origins.
2. In Chrome or Edge, click the icon beside the address bar → Site settings → set **Camera** and **Microphone** to **Allow**, then reload.
3. In Windows Settings → Privacy & security → Camera, enable camera access and **Let desktop apps access your camera**. Check microphone access too.
4. Close Teams/Zoom or another app using the webcam, then reload the meeting.
5. This patched version requests camera and microphone independently, shows a warning if either fails, and offers playback retry if autoplay is blocked. If video is still black, open DevTools (F12) → Console and inspect the logged camera or playback error.
6. If local video works but participants cannot see one another across networks, configure a TURN server. The provided public STUN server alone cannot connect all network combinations.

After applying an updated project ZIP, preserve your original `server/.env`, `client/.env`, and the SQLite database and uploaded files. Do not overwrite them with blank defaults.
