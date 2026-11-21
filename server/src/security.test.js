import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerSchema,
  encrypt,
  decrypt,
  validateEnvironment,
} from "./security.js";
test("registration rejects short passwords", () =>
  assert.equal(
    registerSchema.safeParse({
      name: "Alice",
      email: "a@example.com",
      password: "short",
    }).success,
    false,
  ));
test("registration normalizes emails", () =>
  assert.equal(
    registerSchema.parse({
      name: "Alice",
      email: "Alice@EXAMPLE.COM",
      password: "password123",
    }).email,
    "alice@example.com",
  ));
test("authenticated encryption round-trips and randomizes", () => {
  process.env.ENCRYPTION_KEY ||= "a".repeat(64);
  const a = encrypt("private content");
  const b = encrypt("private content");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "private content");
});
test("key validation rejects invalid secrets", () => {
  const prev = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "broken";
  assert.throws(validateEnvironment);
  process.env.ENCRYPTION_KEY = prev;
});
