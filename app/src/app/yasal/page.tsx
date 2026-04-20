import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadYasal() {
  try {
    const htmlPath = join(process.cwd(), 'src', 'app', 'yasal', 'yasal_final.html')
    const raw = readFileSync(htmlPath, 'utf-8')
    const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/i)
    const bodyMatch = raw.match(/<body>([\s\S]*?)<\/body>/i)
    return {
      style: styleMatch?.[1] ?? '',
      body: bodyMatch?.[1] ?? '',
    }
  } catch {
    return { style: '', body: '' }
  }
}

export const metadata = {
  title: 'Yasal Metinler — Finrate',
  description: 'Gizlilik Politikası, KVKK Aydınlatma Metni, Kullanım Koşulları, Çerez Politikası ve Sorumluluk Reddi Beyanı.',
}

export default function YasalPage() {
  const { style, body } = loadYasal()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  )
}
