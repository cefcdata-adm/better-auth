import nodemailer from "nodemailer";

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderEmailTemplate({
  heading,
  intro,
  quote,
  ctaText,
  ctaUrl,
  footer = "CEFC Woodlands",
}: {
  heading: string;
  intro: string;
  quote?: string;
  ctaText: string;
  ctaUrl: string;
  footer?: string;
}): string {
  const logoUrl = `${process.env.BETTER_AUTH_URL ?? ""}/email-logo.png`;

  return `
<div style="background-color:#f0f0ee;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #dcdcda;border-radius:16px;padding:40px 32px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="${logoUrl}" alt="Covenant EFC" height="21" style="height:21px;width:auto;display:inline-block;border:0;" />
    </div>
    <h1 style="font-size:22px;font-weight:700;color:#1f2328;margin:0 0 16px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#3f3f3f;margin:0 0 24px;">${intro}</p>
    ${quote ? `<div style="background-color:#f4f4f2;border-left:3px solid #6b6f72;padding:16px 20px;margin:0 0 28px;color:#33302b;font-size:15px;line-height:1.6;">${quote}</div>` : ""}
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${ctaUrl}" style="display:inline-block;background-color:#3f4448;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;">${ctaText}</a>
    </div>
    <hr style="border:none;border-top:1px solid #ececec;margin:0 0 20px;" />
    <p style="font-size:13px;color:#8a8a8a;margin:0;">${footer}</p>
  </div>
</div>`;
}

const port = Number(process.env.SMTP_PORT);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}
