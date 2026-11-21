import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  registerSchema,
  loginSchema,
  roomSchema,
  getToken,
  signToken,
  verifyToken,
  encrypt,
  decrypt,
  publicUser,
  randomCode,
  validateEnvironment,
} from "./security.js";

validateEnvironment();
const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());
const io = new Server(httpServer, {
  cors: { origin: origins, methods: ["GET", "POST"] },
  maxHttpBufferSize: 100_000,
});
const PORT = Number(process.env.PORT || 4000);
const maxPeers = Number(process.env.MAX_ROOM_PEERS || 8);
const uploadDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  process.env.UPLOAD_DIR || "uploads",
);
fs.mkdirSync(uploadDir, { recursive: true });
app.use(helmet());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "128kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 25,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
function fail(res, status, message) {
  return res.status(status).json({ error: message });
}
async function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return fail(res, 401, "Sign in required");
    const id = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return fail(res, 401, "Account unavailable");
    req.user = user;
    next();
  } catch {
    return fail(res, 401, "Session expired. Sign in again");
  }
}
async function membership(userId, roomId) {
  return prisma.membership.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });
}
const selectRoom = {
  id: true,
  name: true,
  code: true,
  creatorId: true,
  createdAt: true,
  _count: { select: { memberships: true } },
};
const formatMessage = (message) => ({
  id: message.id,
  roomId: message.roomId,
  text: decrypt(message.ciphertext),
  senderId: message.senderId,
  sender: message.sender ? publicUser(message.sender) : undefined,
  createdAt: message.createdAt,
});
const formatFile = (file) => ({
  id: file.id,
  roomId: file.roomId,
  name: file.name,
  mimeType: file.mimeType,
  size: file.size,
  uploaderId: file.uploaderId,
  uploader: file.uploader ? publicUser(file.uploader) : undefined,
  createdAt: file.createdAt,
});

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "aurora-meet" }),
);
app.post(
  "/api/auth/register",
  wrap(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    const { name, email, password } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } }))
      return fail(res, 409, "Email already registered");
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });
    return res
      .status(201)
      .json({ token: signToken(user.id), user: publicUser(user) });
  }),
);
app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "Invalid credentials");
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (
      !user ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    )
      return fail(res, 401, "Invalid email or password");
    return res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);
app.get("/api/me", auth, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);
app.get(
  "/api/rooms",
  auth,
  wrap(async (req, res) => {
    const rows = await prisma.room.findMany({
      where: { memberships: { some: { userId: req.user.id } } },
      select: selectRoom,
      orderBy: { createdAt: "desc" },
    });
    res.json({ rooms: rows });
  }),
);
app.post(
  "/api/rooms",
  auth,
  wrap(async (req, res) => {
    const parsed = roomSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0].message);
    const room = await prisma.room.create({
      data: {
        name: parsed.data.name,
        code: randomCode(),
        creatorId: req.user.id,
        memberships: { create: { userId: req.user.id, role: "OWNER" } },
      },
      select: selectRoom,
    });
    res.status(201).json({ room });
  }),
);
app.post(
  "/api/rooms/join",
  auth,
  wrap(async (req, res) => {
    const code = z
      .string()
      .trim()
      .min(6)
      .max(32)
      .safeParse(req.body?.code?.toUpperCase());
    if (!code.success) return fail(res, 400, "Enter a valid invitation code");
    const room = await prisma.room.findUnique({
      where: { code: code.data },
      select: selectRoom,
    });
    if (!room) return fail(res, 404, "No room found with that code");
    await prisma.membership.upsert({
      where: { userId_roomId: { userId: req.user.id, roomId: room.id } },
      create: { userId: req.user.id, roomId: room.id },
      update: {},
    });
    res.json({ room });
  }),
);
app.get(
  "/api/rooms/:id",
  auth,
  wrap(async (req, res) => {
    if (!(await membership(req.user.id, req.params.id)))
      return fail(res, 403, "Not a member of this room");
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarColor: true },
            },
          },
        },
      },
    });
    if (!room) return fail(res, 404, "Room not found");
    const [messages, files, strokes] = await Promise.all([
      prisma.message.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: "asc" },
        take: 150,
        include: { sender: true },
      }),
      prisma.sharedFile.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { uploader: true },
      }),
      prisma.stroke.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: "asc" },
        take: 1500,
      }),
    ]);
    res.json({
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        creatorId: room.creatorId,
        members: room.memberships.map((m) => publicUser(m.user)),
      },
      messages: messages.map(formatMessage),
      files: files.map(formatFile),
      strokes: strokes.map((s) => JSON.parse(s.payload)),
    });
  }),
);
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, crypto.randomUUID()),
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const prohibited =
      /\.(exe|dll|bat|cmd|com|scr|ps1|sh|js|mjs|html|htm|svg)$/i;
    cb(null, !prohibited.test(file.originalname));
  },
});
app.post(
  "/api/rooms/:id/files",
  auth,
  wrap(async (req, res, next) => {
    if (!(await membership(req.user.id, req.params.id)))
      return fail(res, 403, "Not a member of this room");
    next();
  }),
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) return fail(res, 400, "Choose a supported file up to 15 MB");
    const file = await prisma.sharedFile.create({
      data: {
        roomId: req.params.id,
        uploaderId: req.user.id,
        name: path.basename(req.file.originalname).slice(0, 180),
        storageName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
      include: { uploader: true },
    });
    const result = formatFile(file);
    io.to(`room:${req.params.id}`).emit("file:new", result);
    res.status(201).json({ file: result });
  }),
);
app.get(
  "/api/files/:id",
  auth,
  wrap(async (req, res) => {
    const file = await prisma.sharedFile.findUnique({
      where: { id: req.params.id },
    });
    if (!file) return fail(res, 404, "File unavailable");
    if (!(await membership(req.user.id, file.roomId)))
      return fail(res, 403, "Access denied");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/octet-stream");
    res.download(path.join(uploadDir, file.storageName), file.name);
  }),
);

// Ephemeral media-presence state. Socket.IO transports signaling only; WebRTC transports media.
const active = new Map();
const memberSockets = (roomId) => [...(active.get(roomId)?.values() || [])];
function safeAck(ack, result) {
  if (typeof ack === "function") ack(result);
}
io.use(async (socket, next) => {
  try {
    const userId = verifyToken(socket.handshake.auth?.token);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return next(new Error("Account unavailable"));
    socket.data.user = publicUser(user);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});
io.on("connection", (socket) => {
  socket.on("room:join", async ({ roomId } = {}, ack) => {
    try {
      if (
        typeof roomId !== "string" ||
        !(await membership(socket.data.user.id, roomId))
      )
        return safeAck(ack, { error: "Room access denied" });
      if (socket.data.roomId && socket.data.roomId !== roomId)
        leaveRoom(socket);
      const peers = memberSockets(roomId).filter(
        (p) => p.socketId !== socket.id,
      );
      if (peers.length >= maxPeers)
        return safeAck(ack, {
          error: `Meeting is full (${maxPeers} people max)`,
        });
      socket.join(`room:${roomId}`);
      socket.data.roomId = roomId;
      const current = active.get(roomId) || new Map();
      current.set(socket.id, {
        socketId: socket.id,
        user: socket.data.user,
        mic: true,
        camera: true,
        screen: false,
      });
      active.set(roomId, current);
      safeAck(ack, { peers });
      socket
        .to(`room:${roomId}`)
        .emit("peer:joined", {
          socketId: socket.id,
          user: socket.data.user,
          mic: true,
          camera: true,
          screen: false,
        });
      io.to(`room:${roomId}`).emit("room:presence", memberSockets(roomId));
    } catch {
      safeAck(ack, { error: "Unable to join meeting" });
    }
  });
  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("peer:signal", ({ to, data } = {}) => {
    if (
      !socket.data.roomId ||
      typeof to !== "string" ||
      !active.get(socket.data.roomId)?.has(to)
    )
      return;
    if (!data || !["offer", "answer", "candidate"].includes(data.type)) return;
    io.to(to).emit("peer:signal", { from: socket.id, data });
  });
  socket.on("peer:media", ({ mic, camera, screen } = {}) => {
    const roomId = socket.data.roomId;
    const state = active.get(roomId)?.get(socket.id);
    if (!state) return;
    for (const [key, val] of Object.entries({ mic, camera, screen }))
      if (typeof val === "boolean") state[key] = val;
    io.to(`room:${roomId}`).emit("room:presence", memberSockets(roomId));
  });
  socket.on("chat:send", async ({ text } = {}, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId) return safeAck(ack, { error: "Join meeting first" });
    if (typeof text !== "string" || !text.trim() || text.length > 3000)
      return safeAck(ack, { error: "Message must be 1–3000 characters" });
    try {
      const message = await prisma.message.create({
        data: {
          roomId,
          senderId: socket.data.user.id,
          ciphertext: encrypt(text.trim()),
        },
        include: { sender: true },
      });
      io.to(`room:${roomId}`).emit("chat:new", formatMessage(message));
      safeAck(ack, { ok: true });
    } catch {
      safeAck(ack, { error: "Message failed" });
    }
  });
  socket.on("whiteboard:stroke", async (stroke = {}, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const valid =
      typeof stroke.id === "string" &&
      stroke.id.length < 100 &&
      ["pen", "eraser"].includes(stroke.tool) &&
      /^#[0-9a-fA-F]{6}$/.test(stroke.color) &&
      Number.isFinite(stroke.width) &&
      stroke.width >= 1 &&
      stroke.width <= 40 &&
      Array.isArray(stroke.points) &&
      stroke.points.length >= 1 &&
      stroke.points.length <= 1200 &&
      stroke.points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
      );
    if (!valid) return safeAck(ack, { error: "Invalid drawing" });
    try {
      const payload = {
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points,
        authorId: socket.data.user.id,
      };
      await prisma.stroke.create({
        data: {
          id: payload.id,
          roomId,
          authorId: socket.data.user.id,
          payload: JSON.stringify(payload),
        },
      });
      socket.to(`room:${roomId}`).emit("whiteboard:stroke", payload);
      safeAck(ack, { ok: true });
    } catch {
      safeAck(ack, { error: "Drawing not saved" });
    }
  });
  socket.on("whiteboard:clear", async (_, ack) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      await prisma.stroke.deleteMany({ where: { roomId } });
      io.to(`room:${roomId}`).emit("whiteboard:clear");
      safeAck(ack, { ok: true });
    } catch {
      safeAck(ack, { error: "Could not clear whiteboard" });
    }
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  socket.leave(`room:${roomId}`);
  const peers = active.get(roomId);
  peers?.delete(socket.id);
  if (peers?.size === 0) active.delete(roomId);
  socket.to(`room:${roomId}`).emit("peer:left", { socketId: socket.id });
  io.to(`room:${roomId}`).emit("room:presence", memberSockets(roomId));
  socket.data.roomId = null;
}
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError)
    return fail(
      res,
      400,
      err.code === "LIMIT_FILE_SIZE"
        ? "File is too large (15 MB max)"
        : err.message,
    );
  if (err?.code === "P2002") return fail(res, 409, "That item already exists");
  if (err?.code === "P2025") return fail(res, 404, "Item not found");
  if (err instanceof SyntaxError && "body" in err)
    return fail(res, 400, "Invalid JSON");
  console.error(err);
  return fail(res, 500, "Unexpected server error");
});
httpServer.listen(PORT, () =>
  console.log(`Aurora API listening on http://localhost:${PORT}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await prisma.$disconnect();
    httpServer.close();
    process.exit(0);
  });
