/**
 * The post.
 *
 * Notices leave the building through one provider, chosen from the
 * environment the same way the paper's writer is: a key means it is on, no key
 * means the desk keeps its letters in the drawer rather than failing. Nothing
 * here throws. A notice that cannot be sent is not worth blocking a window
 * over, so every path answers with whether it went and the caller carries on.
 *
 * Resend is the provider. It is one POST with a bearer key, so there is no
 * client library to keep in step with the rest of the app, and a missing or
 * rejected address is answered with a status code rather than an exception.
 */

export type MailProvider = "resend" | "none";

/** Which provider the environment has paid for, or none. */
export function mailProvider(): MailProvider {
  const explicit = process.env.MAIL_PROVIDER;
  if (explicit === "resend") return "resend";
  if (explicit === "none") return "none";
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

/**
 * The address notices come from. The provider's own test sender is the
 * fallback, so an app with a key and no domain still gets its first letter out.
 */
export function mailFrom(): string {
  const from = (process.env.RESEND_EMAIL_FROM ?? "").trim();
  return from.length > 0 ? from : "onboarding@resend.dev";
}

/** Where the desk's post may be written on the wire, for a footer. */
export function mailDescription(): string {
  return mailProvider() === "none"
    ? "Notices are held at the desk. No mail key is set."
    : `Posted from ${mailFrom()}.`;
}

export interface Mail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

async function callResend(mail: Mail, key: string): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: mail.from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  return response.ok;
}

/**
 * Sends one letter. Returns whether it went, and never throws: a bad address,
 * a revoked key or a provider having a bad afternoon all read as "not sent".
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (mailProvider() === "none") return false;
  try {
    const work = callResend(mail, process.env.RESEND_API_KEY ?? "");
    // A notice is news, not a receipt with a legal deadline, so it does not
    // hold a window open waiting for a provider that has stopped answering.
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8_000));
    return await Promise.race([work, timeout]);
  } catch {
    return false;
  }
}
