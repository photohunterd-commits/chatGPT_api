import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = config.smtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? {
            user: config.smtp.user,
            pass: config.smtp.password
          }
        : undefined
    })
  : null;

export function isEmailConfigured() {
  return Boolean(transporter && config.smtp?.from);
}

export async function sendWelcomeEmail(input: { email: string; name: string }) {
  if (!transporter || !config.smtp?.from) {
    return false;
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: input.email,
    subject: "Welcome to GPT-5.4 Workspace",
    text: [
      `Hello, ${input.name}!`,
      "",
      "Your account has been created successfully.",
      "You can now sign in to the desktop app and start working with private projects and chats."
    ].join("\n"),
    html: `
      <p>Hello, <strong>${escapeHtml(input.name)}</strong>!</p>
      <p>Your account has been created successfully.</p>
      <p>You can now sign in to the desktop app and start working with private projects and chats.</p>
    `
  });

  return true;
}

export async function sendPasswordResetEmail(input: {
  email: string;
  expiresInMinutes: number;
  name: string;
  token: string;
}) {
  if (!transporter || !config.smtp?.from) {
    throw new Error("Password recovery email is not configured on this server yet.");
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: input.email,
    subject: "Password reset for GPT-5.4 Workspace",
    text: [
      `Hello, ${input.name}!`,
      "",
      "A password reset was requested for your GPT-5.4 Workspace account.",
      `Use this token in the desktop app: ${input.token}`,
      `The token expires in ${input.expiresInMinutes} minutes.`,
      "",
      "If you did not request this reset, you can ignore this email."
    ].join("\n"),
    html: `
      <p>Hello, <strong>${escapeHtml(input.name)}</strong>!</p>
      <p>A password reset was requested for your GPT-5.4 Workspace account.</p>
      <p>Use this token in the desktop app:</p>
      <p><strong style="font-size:18px">${escapeHtml(input.token)}</strong></p>
      <p>The token expires in ${input.expiresInMinutes} minutes.</p>
      <p>If you did not request this reset, you can ignore this email.</p>
    `
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
