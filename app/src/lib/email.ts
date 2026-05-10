import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

const SMTP_HOST = process.env.SMTP_HOST ?? ''
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465)
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const SMTP_FROM = process.env.SMTP_FROM ?? ''

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
  console.warn('[email] SMTP env değişkenleri eksik — mail gönderilemez')
}

const smtpOptions: SMTPTransport.Options = {
  host:              SMTP_HOST,
  port:              SMTP_PORT,
  secure:            SMTP_PORT === 465, // 465 → TLS/SSL
  auth:              { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 10_000,
  greetingTimeout:   10_000,
  socketTimeout:     10_000,
  // pool: false — SMTPTransport.Options zaten non-pool (default)
}

const transporter = nodemailer.createTransport(smtpOptions)

export async function sendMail(opts: {
  to:      string
  subject: string
  html:    string
  text:    string
}) {
  return transporter.sendMail({
    from:    SMTP_FROM,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
  })
}
