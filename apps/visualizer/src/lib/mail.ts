import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/** Local Mailhog (or similar) — messages are captured, not delivered to real inboxes. */
export function isDevMailCapture(): boolean {
  const host = process.env.SMTP_HOST ?? 'localhost';
  const port = Number(process.env.SMTP_PORT ?? 1025);
  return (
    process.env.NODE_ENV === 'development' &&
    (host === 'localhost' || host === '127.0.0.1') &&
    port === 1025
  );
}

export function devMailInboxUrl(): string {
  return process.env.MAILHOG_WEB_URL ?? 'http://localhost:8025';
}

let cached: Transporter | null = null;

function makeTransporter(): Transporter {
  const host = process.env.SMTP_HOST ?? 'localhost';
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export function getMailer(): Transporter {
  if (!cached) cached = makeTransporter();
  return cached;
}

export async function sendMagicLinkEmail(opts: {
  to: string;
  loginUrl: string;
  expiresMinutes: number;
}): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'torus.wtf <noreply@torus.wtf>';
  await getMailer().sendMail({
    from,
    to: opts.to,
    subject: 'Your torus.wtf sign-in link',
    text: [
      'Click the link below to sign in to torus.wtf:',
      '',
      opts.loginUrl,
      '',
      `This link expires in ${opts.expiresMinutes} minutes. If you didn't request it, you can ignore this email.`,
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0a0b1e;">
        <h1 style="margin: 0 0 16px; font-size: 22px;">Sign in to torus.wtf</h1>
        <p style="margin: 0 0 24px; color: #444;">Click the button below to finish signing in.</p>
        <a href="${opts.loginUrl}"
           style="display: inline-block; padding: 14px 28px; background: #0a0b1e; color: #fff; border-radius: 999px; text-decoration: none; font-weight: 500;">Sign in</a>
        <p style="margin: 32px 0 0; color: #888; font-size: 13px;">Or paste this link in your browser:<br/><span style="word-break: break-all;">${opts.loginUrl}</span></p>
        <p style="margin: 24px 0 0; color: #aaa; font-size: 12px;">Expires in ${opts.expiresMinutes} minutes. If you didn't request it, ignore this email.</p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendFeedbackEmail(opts: {
  to: string;
  category: 'bug' | 'feature' | 'other';
  title: string;
  body: string;
  pageUrl?: string;
  userEmail?: string | null;
}): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'torus.wtf <noreply@torus.wtf>';
  const categoryLabel =
    opts.category === 'bug' ? 'Bug' : opts.category === 'feature' ? 'Feature' : 'Other';

  const meta = [
    opts.userEmail ? `From account: ${opts.userEmail}` : null,
    opts.pageUrl ? `Page: ${opts.pageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const text = [opts.body, meta ? `\n---\n${meta}` : ''].join('');

  await getMailer().sendMail({
    from,
    to: opts.to,
    replyTo: opts.userEmail ?? undefined,
    subject: `[torus feedback · ${categoryLabel}] ${opts.title}`,
    text,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #0a0b1e;">
        <p style="margin: 0 0 8px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.08em;">${categoryLabel}</p>
        <h1 style="margin: 0 0 16px; font-size: 20px;">${escapeHtml(opts.title)}</h1>
        <pre style="margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.5;">${escapeHtml(opts.body)}</pre>
        ${
          meta
            ? `<p style="margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #888; white-space: pre-wrap;">${escapeHtml(meta)}</p>`
            : ''
        }
      </div>
    `,
  });
}
