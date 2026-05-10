import { config } from 'dotenv'
// dotenv ÖNCE yüklenmeli — email.ts'deki module-level transporter singleton için
config({ path: '.env.local', override: true })

async function main() {
  const TEST_RECIPIENT = process.argv[2]

  if (!TEST_RECIPIENT) {
    console.error('Kullanım: npm run test:smtp -- alici@ornek.com')
    process.exit(1)
  }

  console.log('SMTP test başlıyor...')
  console.log('Host:', process.env.SMTP_HOST)
  console.log('Port:', process.env.SMTP_PORT)
  console.log('User:', process.env.SMTP_USER)
  console.log('From:', process.env.SMTP_FROM)
  console.log('Alıcı:', TEST_RECIPIENT)
  console.log('')

  // Dinamik import: dotenv.config() çalıştıktan SONRA modülleri yükle
  // (statik import hoisted olur → env henüz yüklü olmaz → transporter host='' alır)
  const { sendMail }       = await import('../src/lib/email')
  const { buildVerifyEmail } = await import('../src/lib/email-templates/verify-email')

  try {
    const testCode = '123456'
    const { subject, html, text } = buildVerifyEmail({
      code:     testCode,
      fullName: 'Test Kullanıcı',
    })

    const result = await sendMail({
      to:      TEST_RECIPIENT,
      subject: '[TEST] ' + subject,
      html,
      text,
    })

    console.log('✓ Mail gönderildi')
    console.log('Message ID:', result.messageId)
    console.log('Response:  ', result.response)
    console.log('')
    console.log('Şimdi', TEST_RECIPIENT, 'adresini kontrol et.')
    console.log('Gelen kutusunda yoksa SPAM/Önemsiz klasörüne bak.')
  } catch (err) {
    console.error('✗ Mail gönderilemedi:')
    console.error(err)
    process.exit(1)
  }
}

main()
