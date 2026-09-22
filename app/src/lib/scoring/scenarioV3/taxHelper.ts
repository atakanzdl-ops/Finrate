/**
 * R17.1 — Sermaye şirketleri için kurumlar vergisi hesaplama helper'ı.
 * 2026 GİB oranı: %25 sabit.
 *
 * Codex 5 Kritik Şart:
 * 1. AccountingTransaction TAM tip (transactionId, description, semanticType, legs)
 * 2. '690' hesabı bu helper'da YOK — sadece 691 + 370
 * 3. Net kâr transferi (brüt yerine)
 * 4. 590 manuel DEBIT YOK
 * 5. semanticType parametre olarak alınır (enum'da 'tax_provision' yok)
 */

import type { AccountingTransaction, SemanticType } from './contracts'

/**
 * Sermaye şirketi kurumlar vergisi oranı.
 * 2026 GİB: %25 sabit.
 */
export const CORPORATE_TAX_RATE = 0.25

/**
 * Brüt kâr tutarı için vergi tutarı hesaplar.
 * Negatif veya sıfır kâr → 0 vergi (zarar durumu).
 */
export function calculateTaxAmount(grossProfit: number): number {
  if (grossProfit <= 0) return 0
  return Math.round(grossProfit * CORPORATE_TAX_RATE * 100) / 100
}

/**
 * Brüt kâr tutarından vergi sonrası net kâr hesaplar.
 */
export function calculateNetProfit(grossProfit: number): number {
  return grossProfit - calculateTaxAmount(grossProfit)
}

/**
 * Vergi provizyon transaction'ı oluşturur (dengeli çift ayak).
 *   691 DR (Dönem Kârı Vergi Karşılığı)
 *   370 CR (Dönem Kârının Vergi Yükümlülükleri)
 *
 * @param grossProfit  Vergi öncesi brüt kâr (pozitif olmalı)
 * @param actionId     Aksiyon ID (transactionId prefix)
 * @param parentSemanticType  Parent aksiyonun semanticType değeri
 * @returns AccountingTransaction veya null (zarar/sıfır durumu)
 */
export function buildTaxProvisionTransaction(
  grossProfit: number,
  actionId: string,
  parentSemanticType: SemanticType
): AccountingTransaction | null {
  const taxAmount = calculateTaxAmount(grossProfit)
  if (taxAmount === 0) return null

  return {
    transactionId: `${actionId}_TAX_PROVISION`,
    description: 'Kurumlar vergisi karşılığı (%25)',
    semanticType: parentSemanticType,
    legs: [
      {
        accountCode: '691',
        side: 'DEBIT',
        amount: taxAmount,
        accountName: 'Dönem Kârı Vergi Karşılığı',
        description: 'Kurumlar vergisi gideri',
      },
      {
        accountCode: '370',
        side: 'CREDIT',
        amount: taxAmount,
        accountName: 'Dönem Kârının Vergi Yükümlülükleri',
        description: 'Vergi yükümlülüğü',
      },
    ],
  }
}

/**
 * NET kâr transferi transaction'ı oluşturur (dengeli çift ayak).
 *   690 DR (Dönem Kârı veya Zararı) — NET tutar
 *   590 CR (Dönem Net Kârı)          — NET tutar
 *
 * @param grossProfit  Vergi öncesi brüt kâr
 * @param actionId     Aksiyon ID (transactionId prefix)
 * @param parentSemanticType  Parent aksiyonun semanticType değeri
 * @returns AccountingTransaction veya null (zarar durumu)
 */
export function buildNetProfitTransferTransaction(
  grossProfit: number,
  actionId: string,
  parentSemanticType: SemanticType
): AccountingTransaction | null {
  const netProfit = calculateNetProfit(grossProfit)
  if (netProfit <= 0) return null

  return {
    transactionId: `${actionId}_NET_PROFIT_TRANSFER`,
    description: 'Dönem net kârı transferi',
    semanticType: parentSemanticType,
    legs: [
      {
        accountCode: '690',
        side: 'DEBIT',
        amount: netProfit,
        accountName: 'Dönem Kârı veya Zararı',
        description: 'Vergi sonrası net kâr',
      },
      {
        accountCode: '590',
        side: 'CREDIT',
        amount: netProfit,
        accountName: 'Dönem Net Kârı',
        description: 'Özkaynağa aktarılan net kâr',
      },
    ],
  }
}
