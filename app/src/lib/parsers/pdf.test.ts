/**
 * pdf.ts — detectPdfType + docType testleri (Faz 7.3.15)
 *
 * Kapsam:
 *   detectPdfType: MIZAN / BEYANNAME / UNKNOWN
 *   Kontrol sırası: mizan önce (mizan içinde beyanname kelimesi olabilir)
 *   parsePdfMizan → docType: 'MIZAN'
 *   parsePdfBuffer (beyanname) → docType: 'BEYANNAME'
 *
 * Mock stratejisi:
 *   parsePdfBuffer ve parsePdfMizan: gerçek PDF parse edilmez (binary gerektirir)
 *   detectPdfType: sadece metin string ile test edilir → mock gerekmez
 */

import { detectPdfType } from './pdf'

// ─── detectPdfType ────────────────────────────────────────────────────────────

describe('detectPdfType', () => {

  // ── MIZAN ──────────────────────────────────────────────────────────────────

  test('Mizan: "mizan" + "hesap kodu" → MIZAN', () => {
    const text = 'MİZAN TABLOSU\nHesap Kodu Açıklama Borç Alacak\n100 KASA 50000 0'
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  test('Mizan: "mizan" + "açıklama borç alacak" pattern → MIZAN', () => {
    const text = 'GENEL MİZAN\naçıklama borç alacak\n100 Kasa 100000 0'
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  test('Mizan + beyanname kelimesi birlikte → MIZAN (mizan öncelikli)', () => {
    // Mizan PDF'leri "Beyanname" header'ı içerebilir — mizan önce kontrol edilmeli
    const text = [
      'Kurumlar Vergisi Beyannamesi',
      'MİZAN TABLOSU',
      'Hesap Kodu Hesap Adı Borç Alacak',
      '100 Kasa 50000 0',
    ].join('\n')
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  // ── BEYANNAME ──────────────────────────────────────────────────────────────

  test('Kurumlar Vergisi Beyannamesi → BEYANNAME', () => {
    const text = 'KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024\n'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Yıllık Gelir Vergisi Beyannamesi → BEYANNAME', () => {
    const text = 'YILLIK GELİR VERGİSİ BEYANNAMESİ\nYılı 2024\n'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Geçici Vergi Beyannamesi (kurumlar) → BEYANNAME', () => {
    const text = 'Geçici Vergi Beyannamesi\nKurumlar Vergisi Mükellefleri\n3. Dönem 2024'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Geçici Vergi Beyannamesi (gelir) → BEYANNAME', () => {
    const text = 'Geçici Vergi Beyannamesi\nGelir Vergisi Mükellefleri\n2. Dönem 2024'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  // ── UNKNOWN ────────────────────────────────────────────────────────────────

  test('Rastgele metin → UNKNOWN', () => {
    expect(detectPdfType('Bu bir PDF metnidir. Hiçbir şey yok.')).toBe('UNKNOWN')
  })

  test('Boş metin → UNKNOWN', () => {
    expect(detectPdfType('')).toBe('UNKNOWN')
  })

  test('"Mizan" kelimesi var ama hesap kodu yok → UNKNOWN (mizan pattern eşleşmez)', () => {
    // detectPdfMizan: mizan + (hesap kodu VEYA açıklama borç alacak) şart
    // Sadece "mizan" kelimesi yeterli değil
    const text = 'Bu raporun mizan bölümü henüz hazırlanmamıştır.'
    expect(detectPdfType(text)).toBe('UNKNOWN')
  })
})
