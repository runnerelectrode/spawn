import { Resend } from "resend";
import { db } from "../db/client";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function notifyUser(
  userId: string,
  subject: string,
  html: string
): Promise<void> {
  const { data: user } = await db
    .from("users")
    .select("email, notify_email, notify_webhook_url")
    .eq("id", userId)
    .single();

  if (!user) return;

  if (user.notify_email && user.email) {
    await resend.emails.send({
      from: "Spawn <notifications@spawn.dev>",
      to: user.email,
      subject,
      html,
    }).catch((e) => console.error("Email failed:", e));
  }

  if (user.notify_webhook_url) {
    await fetch(user.notify_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message: subject }),
    }).catch((e) => console.error("Webhook failed:", e));
  }
}

export function deploySuccessEmail(appName: string, url: string, commitMsg: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#16a34a">✓ ${appName} is live</h2>
      <p>Your latest deploy is running.</p>
      <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
      <p><strong>Commit:</strong> ${commitMsg}</p>
      <a href="${url}" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Open App</a>
    </div>
  `;
}

export function deployFailedEmail(appName: string, error: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#dc2626">✗ Deploy failed — ${appName}</h2>
      <p>Your deploy failed. Spawn will attempt to self-heal.</p>
      <pre style="background:#f4f4f4;padding:12px;border-radius:4px;font-size:12px">${error}</pre>
    </div>
  `;
}

export function healActionEmail(appName: string, action: string, description: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#d97706">⚡ Auto-healed — ${appName}</h2>
      <p><strong>Action:</strong> ${action}</p>
      <p><strong>What happened:</strong> ${description}</p>
      <p>Your app is back online.</p>
    </div>
  `;
}
