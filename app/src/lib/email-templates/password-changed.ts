export function buildPasswordChangedEmail(opts: { fullName?: string; changedAt: Date }) {
  const greeting = opts.fullName ? `Merhaba ${opts.fullName},` : 'Merhaba,'

  const changedAtStr = opts.changedAt.toLocaleString('tr-TR', {
    day:      'numeric',
    month:    'long',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'Europe/Istanbul',
  })

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
              <p style="margin:0 0 8px;color:#1E293B;font-size:16px;font-weight:600;">Şifreniz Değiştirildi</p>
              <p style="margin:0 0 24px;color:#5A7A96;font-size:14px;">${greeting}</p>
              <p style="margin:0 0 16px;color:#1E293B;font-size:14px;line-height:1.6;">
                Finrate hesabınızın şifresi <strong>${changedAtStr}</strong> tarihinde başarıyla değiştirildi.
              </p>
              <p style="margin:0 0 24px;color:#1E293B;font-size:14px;line-height:1.6;">
                Güvenliğiniz için tüm aktif oturumlarınız sonlandırıldı.
              </p>
              <!-- Uyarı kutusu -->
              <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:6px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;color:#92400E;font-size:13px;font-weight:700;">Bu işlemi siz yapmadıysanız:</p>
                <ol style="margin:8px 0 0;padding-left:20px;color:#78350F;font-size:13px;line-height:1.8;">
                  <li>Hemen şifre sıfırlama bağlantısı isteyin</li>
                  <li>info@finrate.com.tr adresinden bize ulaşın</li>
                </ol>
              </div>
              <p style="margin:0;color:#5A7A96;font-size:13px;">
                Şifrenizi siz değiştirdiyseniz başka bir işlem yapmanıza gerek yoktur.
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

Şifreniz Değiştirildi
─────────────────────
Finrate hesabınızın şifresi ${changedAtStr} tarihinde değiştirildi.
Güvenliğiniz için tüm oturumlarınız sonlandırıldı.

Bu işlemi siz yapmadıysanız lütfen hemen şifre sıfırlama isteyin
ve info@finrate.com.tr adresinden bize ulaşın.

Finrate © 2026`

  return { html, text, subject: 'Finrate — Şifreniz Değiştirildi' }
}
