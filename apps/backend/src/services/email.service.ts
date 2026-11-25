import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

/** Masks the local part of an address for logs: "jane.doe@x.edu" → "j***@x.edu". */
function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

/**
 * Sends an email via SMTP. When SMTP is not configured the message is not
 * sent and only a redacted notice is logged — message bodies can carry
 * single-use secrets (invite / reset links) and must never reach the logs.
 */
export async function sendEmail(message: OutgoingEmail): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    logger.warn({ to: maskEmail(message.to), subject: message.subject }, '[Email] SMTP not configured; email not sent');
    return false;
  }
  try {
    await transport.sendMail({ from: env.SMTP_FROM, ...message });
    logger.info({ to: maskEmail(message.to), subject: message.subject }, '[Email] Sent');
    return true;
  } catch (err) {
    logger.error({ err, to: maskEmail(message.to), subject: message.subject }, '[Email] Delivery failed');
    return false;
  }
}

function frontendBaseUrl(): string {
  return env.FRONTEND_URL.split(',')[0].trim().replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export async function sendInvitationEmail(email: string, role: string, token: string): Promise<boolean> {
  const link = `${frontendBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  const roleLabel = role.toLowerCase().replace('_', ' ');
  return sendEmail({
    to: email,
    subject: `You've been invited to join VidyaAI as a ${roleLabel}`,
    text: `Hello,\n\nYou have been invited to join VidyaAI. Open the link below to accept the invitation and set your password:\n\n${link}\n\nThis link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.`,
    html: `<p>Hello,</p><p>You have been invited to join VidyaAI as a <strong>${escapeHtml(roleLabel)}</strong>.</p><p><a href="${escapeHtml(link)}">Accept the invitation and set your password</a></p><p>This link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, expiresInMinutes: number): Promise<boolean> {
  const link = `${frontendBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: 'Reset your VidyaAI password',
    text: `We received a request to reset your VidyaAI password.\n\nOpen this link to choose a new password (valid for ${expiresInMinutes} minutes, single use):\n\n${link}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: `<p>We received a request to reset your VidyaAI password.</p><p><a href="${escapeHtml(link)}">Choose a new password</a> (valid for ${expiresInMinutes} minutes, single use).</p><p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
  });
}
