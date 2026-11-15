const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Renders a short, accessible reminder email. All dynamic text is HTML-escaped. */
export function renderEmail(input: { appUrl: string; greetingName: string; subject: string; lines: string[] }): {
  subject: string;
  text: string;
  html: string;
} {
  const link = `${input.appUrl.replace(/\/$/, "")}/app`;
  const text = [`Hi ${input.greetingName},`, "", ...input.lines, "", `Open Hearth: ${link}`, "", "— Hearth care circle reminders"].join("\n");
  const paragraphs = input.lines.map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5ede0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2a1f17">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:14px;color:#5b4a3c;margin:0 0 8px">Hearth · care circle</p>
<h1 style="font-family:Georgia,serif;font-size:22px;line-height:1.3;margin:0 0 16px">${escapeHtml(input.subject)}</h1>
<p style="margin:0 0 12px">Hi ${escapeHtml(input.greetingName)},</p>${paragraphs}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#c4561c;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open Hearth</a></p>
<p style="font-size:13px;color:#5b4a3c;margin:0">You receive this because you are part of this care circle. Change email settings in Hearth under Circle.</p>
</div></body></html>`;
  return { subject: input.subject, text, html };
}
