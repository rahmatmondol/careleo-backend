import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email over SMTP.
 *
 * This exists because password reset cannot work without it. The reset token
 * has to reach the account owner and *only* the account owner — returning it
 * in the HTTP response, which is what this app did before, let anyone who knew
 * an email address take over that account without ever seeing the inbox.
 *
 * Configuration is entirely environment-driven so the same build runs against
 * a local catcher (Mailpit/Mailhog) and a real provider. With nothing
 * configured, `sendMail` reports failure rather than pretending to send —
 * silently dropping a reset email would look identical to a working system
 * right up until a locked-out customer complains.
 */

const env = (key: string): string => (process.env[key] ?? '').trim();

export const mailerConfig = {
  host: () => env('SMTP_HOST'),
  port: () => Number(env('SMTP_PORT') || 587),
  user: () => env('SMTP_USER'),
  pass: () => env('SMTP_PASSWORD'),
  /** `true` for implicit TLS (port 465); STARTTLS on 587 is negotiated instead. */
  secure: () => env('SMTP_SECURE').toLowerCase() === 'true',
  from: () => env('MAIL_FROM') || 'CareLeo <no-reply@careleo.care>',
  /** Public origin of the storefront — where reset links point. */
  appUrl: () => (env('APP_PUBLIC_URL') || 'http://localhost:3002').replace(/\/$/, ''),
  isConfigured: (): boolean => Boolean(env('SMTP_HOST')),
};

let transporter: Transporter | null = null;

const getTransport = (): Transporter | null => {
  if (!mailerConfig.isConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: mailerConfig.host(),
    port: mailerConfig.port(),
    secure: mailerConfig.secure(),
    // A local catcher accepts mail with no credentials; a real provider will
    // not, and omitting `auth` entirely is what lets both work.
    ...(mailerConfig.user() ? { auth: { user: mailerConfig.user(), pass: mailerConfig.pass() } } : {}),
  });
  return transporter;
};

export type MailResult = { sent: boolean; reason?: string };

/**
 * Send one message.
 *
 * Never throws: callers are auth flows whose response must not change based on
 * whether the mail server was reachable. They log the reason and carry on.
 */
export const sendMail = async (message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> => {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: 'SMTP_HOST is not configured' };
  }

  try {
    await transport.sendMail({
      from: mailerConfig.from(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
};

/** Minimal HTML shell — inline styles only, since email clients drop <style>. */
const wrap = (heading: string, body: string, cta?: { label: string; url: string }): string => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1f2933">
  <h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
  <div style="font-size:15px;line-height:1.6;color:#3e4c59">${body}</div>
  ${
    cta
      ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#f97316;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${cta.label}</a></p>
         <p style="font-size:12px;color:#7b8794;word-break:break-all">If the button does not work, paste this into your browser:<br>${cta.url}</p>`
      : ''
  }
  <p style="font-size:12px;color:#7b8794;margin-top:32px">CareLeo · pet care, handled.</p>
</div>`;

/**
 * Password reset email.
 *
 * The link carries the token; nothing else in the system reveals it. The
 * 30-minute expiry is stated because a reset arriving after a delay is the
 * common support question.
 */
export const sendPasswordResetEmail = async (input: {
  to: string;
  firstName?: string | null;
  token: string;
}): Promise<MailResult> => {
  const url = `${mailerConfig.appUrl()}/reset-password?token=${encodeURIComponent(input.token)}`;
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';

  return sendMail({
    to: input.to,
    subject: 'Reset your CareLeo password',
    text: `${greeting}\n\nUse this link to set a new password. It expires in 30 minutes.\n\n${url}\n\nIf you did not ask for this, you can ignore this email — your password will not change.`,
    html: wrap(
      'Reset your password',
      `<p>${greeting}</p><p>Use the button below to set a new password. The link expires in <strong>30 minutes</strong>.</p>
       <p>If you did not ask for this, you can ignore this email — your password will not change.</p>`,
      { label: 'Set a new password', url },
    ),
  });
};
