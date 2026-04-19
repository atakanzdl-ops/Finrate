// Next.js instrumentation — sunucu başlamadan önce çalışır
// pdf-parse / pdfjs-dist Node.js'te DOMMatrix bekliyor, bu polyfill sağlar
export async function register() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-ignore
    globalThis.DOMMatrix = class DOMMatrix {
      // pdfjs-dist'in ihtiyaç duyduğu minimal surface
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      m11 = 1; m12 = 0; m13 = 0; m14 = 0
      m21 = 0; m22 = 1; m23 = 0; m24 = 0
      m31 = 0; m32 = 0; m33 = 1; m34 = 0
      m41 = 0; m42 = 0; m43 = 0; m44 = 1
      is2D = true; isIdentity = true
      constructor(_init?: unknown) {}
      multiply(_other?: unknown) { return this }
      translate(_tx = 0, _ty = 0, _tz = 0) { return this }
      scale(_s = 1) { return this }
      toJSON() { return this }
    }
  }
}
