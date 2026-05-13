import { readFileSync } from 'node:fs'
import { join }         from 'node:path'
import sanitizeHtml     from 'sanitize-html'

function loadYasal() {
  try {
    const htmlPath = join(process.cwd(), 'src', 'app', 'yasal', 'yasal_final.html')
    const raw = readFileSync(htmlPath, 'utf-8')
    const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
    const bodyMatch  = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    return {
      style: styleMatch?.[1] ?? '',
      body:  bodyMatch?.[1]  ?? '',
    }
  } catch {
    return { style: '', body: '' }
  }
}

export const metadata = {
  title:       'Yasal Metinler — Finrate',
  description: 'Gizlilik Politikası, KVKK Aydınlatma Metni, Kullanım Koşulları, Çerez Politikası ve Sorumluluk Reddi Beyanı.',
}

export default function YasalPage() {
  const { style, body } = loadYasal()

  // Defense in depth: body sanitize edilir (script/event handler kaldırılır)
  // Kaynak statik dosya olduğundan gerçek XSS riski yok;
  // sanitize-html değişiklik gelirse koruma sağlar.
  const cleanBody = sanitizeHtml(body, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'h1', 'h2', 'h3', 'h4',
      'nav', 'section', 'header', 'footer', 'article',
    ]),
    allowedAttributes: {
      '*': ['class', 'id', 'href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  })

  return (
    <>
      {/* <style> için dangerouslySetInnerHTML: kaynak statik CSS, script içermez */}
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: cleanBody }} />
    </>
  )
}
