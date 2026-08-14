import nodemailer from 'nodemailer';

export type SendAccountEmailParams = {
  toEmail: string;
  customerName: string;
  orderNumber: string;
  productName: string;
  login: string;
  password?: string;
  terms?: string;
};

function createTransporter() {
  const host = import.meta.env.SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(import.meta.env.SMTP_PORT || process.env.SMTP_PORT || 465);
  const user = import.meta.env.SMTP_USER || process.env.SMTP_USER;
  const pass = import.meta.env.SMTP_PASS || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // SSL port 465, TLS port 587
    auth: { user, pass },
  });
}

export async function sendAccountDeliveryEmail(params: SendAccountEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const transporter = createTransporter();
  const fromName = import.meta.env.SMTP_FROM_NAME || process.env.SMTP_FROM_NAME || 'TokoSans';
  const fromEmail = import.meta.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || 'noreply@tokosans.biz.id';
  const from = `"${fromName}" <${fromEmail}>`;

  if (!transporter) {
    console.warn('[Email] SMTP belum dikonfigurasi. Email tidak dikirim.');
    return { success: false, error: 'SMTP not configured' };
  }

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eae3f5; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0eaf8;">
        <h1 style="color: #7048e8; margin: 0; font-size: 24px; font-weight: 800;">TokoSans</h1>
        <p style="color: #6b6178; margin-top: 4px; font-size: 14px;">Detail Pesanan & Akun Anda</p>
      </div>

      <div style="padding: 20px 0;">
        <p style="color: #191026; font-size: 16px; margin: 0 0 16px;">Halo <strong>${params.customerName}</strong>,</p>
        <p style="color: #4a3e5c; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Pembayaran untuk pesanan <strong>#${params.orderNumber}</strong> (${params.productName}) telah berhasil terverifikasi! Berikut adalah kredensial akun Anda:
        </p>

        <div style="background-color: #faf8fe; border: 1px solid #7048e8; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
          <div style="margin-bottom: 12px;">
            <span style="font-size: 12px; color: #6b6178; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Username / Login:</span>
            <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #191026; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eae3f5; margin-top: 4px; word-break: break-all;">
              ${params.login}
            </div>
          </div>

          ${params.password ? `
          <div>
            <span style="font-size: 12px; color: #6b6178; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Password / License Key:</span>
            <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #7048e8; background: #fff; padding: 8px 12px; border-radius: 8px; border: 1px solid #eae3f5; margin-top: 4px; word-break: break-all;">
              ${params.password}
            </div>
          </div>
          ` : ''}
        </div>

        ${params.terms ? `
        <div style="background-color: #fffaf0; border: 1px solid #ffe8cc; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px; color: #d9480f; font-size: 14px;">Syarat & Ketentuan Penggunaan:</h4>
          <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5; white-space: pre-line;">${params.terms}</p>
        </div>
        ` : ''}

        <p style="color: #6b6178; font-size: 13px; margin: 0;">
          Anda juga dapat melihat atau mengunduh ulang informasi pesanan ini kapan saja melalui menu <strong>Cek Pesanan</strong> di situs TokoSans.
        </p>

        <div style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 10px; padding: 12px 16px; margin-top: 16px;">
          <p style="margin: 0; font-size: 12px; color: #7a5f00; line-height: 1.6;">
            📬 <strong>Tip:</strong> Jika email ini masuk ke folder <strong>Spam</strong>, klik <strong>"Bukan Spam"</strong> atau <strong>"Not Spam"</strong> dan tambahkan <strong>noreply@tokosans.biz.id</strong> ke kontak Anda agar email berikutnya langsung masuk inbox.
          </p>
        </div>
      </div>

      <div style="border-top: 1px solid #f0eaf8; padding-top: 16px; text-align: center; color: #9c8eb9; font-size: 12px;">
        <p style="margin: 0;">&copy; ${new Date().getFullYear()} TokoSans - Layanan Otomatis 24 Jam</p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to: params.toEmail,
      subject: `[TokoSans] Detail Akun Pesanan #${params.orderNumber} - ${params.productName}`,
      html: htmlContent,
    });

    console.info('[Email] Terkirim ke:', params.toEmail, '| ID:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Email] Gagal mengirim:', msg);
    return { success: false, error: msg };
  }
}

