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

export async function sendAnonymizeRescueEmail(opts: {
  to: string;
  links: { shareCode: string; url: string }[];
}): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'torus.wtf <noreply@torus.wtf>';
  const lines = opts.links.map(
    (l) => `  ${l.shareCode} — ${l.url}`,
  );
  const textBody = [
    'Your torus.wtf account was deleted, but your clips are still online as Anonymous.',
    '',
    'Use these rescue links to manage or delete individual clips (open each link in the same browser):',
    '',
    ...lines,
    '',
    'These links store a claim token locally so you can edit or delete each clip without signing back in.',
  ].join('\n');

  const htmlLinks = opts.links
    .map(
      (l) =>
        `<li style="margin: 8px 0;"><a href="${l.url}" style="color: #22d3ce;">${l.shareCode}</a></li>`,
    )
    .join('');

  await getMailer().sendMail({
    from,
    to: opts.to,
    subject: 'Your torus.wtf clips — rescue links',
    text: textBody,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #0a0b1e;">
        <h1 style="margin: 0 0 16px; font-size: 20px;">Your clips are still online</h1>
        <p style="margin: 0 0 16px; color: #444;">Your account was deleted, but your uploads remain as Anonymous. Open each link to regain manage access for that clip:</p>
        <ul style="padding-left: 20px;">${htmlLinks}</ul>
        <p style="margin: 24px 0 0; color: #aaa; font-size: 12px;">Save these links if you might want to delete clips later.</p>
      </div>
    `,
  });
}
