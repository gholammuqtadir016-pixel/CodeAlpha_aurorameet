import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z
    .string()
    .email()
    .max(160)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
});
export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});
export const roomSchema = z.object({ name: z.string().trim().min(3).max(80) });
export function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
    issuer: "aurora-meet",
  });
}
export function verifyToken(token) {
  const data = jwt.verify(token, process.env.JWT_SECRET, {
    issuer: "aurora-meet",
  });
  if (typeof data !== "object" || typeof data.sub !== "string")
    throw new Error("Invalid token");
  return data.sub;
}
const encryptionKey = () => Buffer.from(process.env.ENCRYPTION_KEY, "hex");
export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}
export function decrypt(value) {
  const [iv, tag, contents] = value.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(contents, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatarColor: user.avatarColor,
});
export const randomCode = () =>
  crypto.randomBytes(5).toString("hex").toUpperCase();
export function validateEnvironment() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must be 32+ characters");
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY || ""))
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters");
}
