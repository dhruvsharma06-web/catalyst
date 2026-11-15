import nodemailer from "nodemailer";
import type { Logger } from "pino";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly transport: "smtp" | "log";
  send(email: Email): Promise<void>;
}

/** "ananya@example.com" → "a***@example.com" — safe for logs and the UI. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export function createSmtpMailer(opts: { host: string; port: number; user?: string; pass?: string; from: string }): Mailer {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    transport: "smtp",
    async send(email) {
      await transporter.sendMail({ from: opts.from, ...email });
    },
  };
}

/** Development mailer: records that an email would be sent, without its body or full address. */
export function createLogMailer(logger: Logger): Mailer {
  return {
    transport: "log",
    async send(email) {
      logger.info({ to: maskEmail(email.to), subject: email.subject }, "email (log transport)");
    },
  };
}
