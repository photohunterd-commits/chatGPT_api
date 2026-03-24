import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";
import type { PublicUser } from "./database.js";

const TOKEN_TTL = "30d";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function createAuthToken(user: PublicUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    config.jwtSecret,
    {
      expiresIn: TOKEN_TTL
    }
  );
}

export function createPasswordResetToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function verifyAuthToken(token: string) {
  const payload = jwt.verify(token, config.jwtSecret);

  if (typeof payload !== "object" || payload === null || typeof payload.sub !== "string") {
    throw new Error("Invalid auth token.");
  }

  return payload.sub;
}
