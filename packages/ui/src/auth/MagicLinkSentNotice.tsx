'use client';

export interface DevMailInfo {
  inboxUrl: string;
  loginUrl: string;
  sent: boolean;
}

interface MagicLinkSentNoticeProps {
  email: string;
  devMail?: DevMailInfo | null;
  compact?: boolean;
  expiresMinutes?: number;
  onUseDifferentEmail?: () => void;
}

/**
 * Shown after POST /api/auth/magic succeeds.
 * In local dev (Mailhog), explains that mail is captured and surfaces the link.
 */
export function MagicLinkSentNotice({
  email,
  devMail,
  compact,
  expiresMinutes = 15,
  onUseDifferentEmail,
}: MagicLinkSentNoticeProps) {
  if (devMail) {
    return (
      <div
        role="status"
        style={{
          margin: 0,
          padding: compact ? 0 : undefined,
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--color-torus-fg-dim, rgba(245,245,250,0.7))',
        }}
      >
        <p style={{ margin: compact ? '0 0 10px' : '0 0 12px' }}>
          <strong style={{ color: 'var(--color-torus-fg)' }}>Local dev mode.</strong> Sign-in emails
          go to{' '}
          <a
            href={devMail.inboxUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--color-torus-mid)' }}
          >
            Mailhog
          </a>
          , not your real inbox ({email || 'your address'}).
        </p>
        <a
          href={devMail.loginUrl}
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            borderRadius: 999,
            background: 'var(--color-torus-fg)',
            color: 'var(--color-torus-bg)',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Sign in now
        </a>
        {!devMail.sent ? (
          <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.75 }}>
            SMTP was unreachable — start Mailhog with{' '}
            <code style={{ fontSize: 11 }}>
              docker compose -f infra/docker-compose.yml up -d mailhog
            </code>
          </p>
        ) : null}
        {onUseDifferentEmail ? (
          <p style={{ margin: '12px 0 0', fontSize: 12 }}>
            <button
              type="button"
              onClick={onUseDifferentEmail}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-torus-mid)',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 12,
              }}
            >
              Use a different email
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      style={{
        margin: 0,
        fontSize: 13,
        lineHeight: 1.5,
        color: 'var(--color-torus-fg-dim, rgba(245,245,250,0.7))',
      }}
    >
      <p style={{ margin: 0 }}>
        Check your inbox — a sign-in link was sent to {email || 'your email'}.
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.85 }}>
        The link expires in {expiresMinutes} minutes. Check your spam folder if it doesn&apos;t
        arrive.
      </p>
      {onUseDifferentEmail ? (
        <p style={{ margin: '12px 0 0', fontSize: 12 }}>
          <button
            type="button"
            onClick={onUseDifferentEmail}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--color-torus-mid)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 12,
            }}
          >
            Use a different email
          </button>
        </p>
      ) : null}
    </div>
  );
}
