export function buildVerifyEmail(opts: { code: string; fullName?: string }) {
  const greeting = opts.fullName ? `Merhaba ${opts.fullName},` : 'Merhaba,'

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Başlık -->
          <tr>
            <td style="background:#0B3C5D;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">FINRATE</h1>
            </td>
          </tr>
          <!-- İçerik -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#1E293B;font-size:16px;font-weight:600;">Hesabınızı Doğrulayın</p>
              <p style="margin:0 0 24px;color:#5A7A96;font-size:14px;">${greeting}</p>
              <p style="margin:0 0 24px;color:#1E293B;font-size:14px;line-height:1.6;">
                Finrate hesabınızı doğrulamak için aşağıdaki 6 haneli kodu kullanın:
              </p>
              <!-- Kod kutusu -->
              <div style="background:#0B3C5D;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
                <span style="color:#ffffff;font-size:36px;font-weight:700;letter-spacing:12px;font-family:'Courier New',monospace;">
                  ${opts.code}
                </span>
              </div>
              <p style="margin:0 0 8px;color:#5A7A96;font-size:13px;">
                Bu kod <strong style="color:#1E293B;">10 dakika</strong> içinde geçerliliğini yitirecektir.
              </p>
              <p style="margin:0;color:#5A7A96;font-size:13px;">
                Bu işlemi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E5E9F0;">
              <p style="margin:0;color:#7A9AB0;font-size:12px;text-align:center;">
                Finrate © 2026 · Bu e-posta otomatik olarak gönderilmiştir.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${greeting}

Finrate hesabınızı doğrulamak için kodunuz:

${opts.code}

Bu kod 10 dakika içinde geçerliliğini yitirecektir.
Bu işlemi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.

Finrate © 2026`

  return { html, text, subject: 'Finrate Doğrulama Kodunuz' }
}
