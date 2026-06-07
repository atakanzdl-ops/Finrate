/**
 * R17.1 — taxHelper.ts unit testleri
 * Sermaye şirketi kurumlar vergisi (%25) helper fonksiyonları
 */

import {
  CORPORATE_TAX_RATE,
  calculateTaxAmount,
  calculateNetProfit,
  buildTaxProvisionTransaction,
  buildNetProfitTransferTransaction,
} from '../taxHelper'

describe('R17.1 — Sermaye şirketi vergi (%25)', () => {

  test('CORPORATE_TAX_RATE = 0.25', () => {
    expect(CORPORATE_TAX_RATE).toBe(0.25)
  })

  test('calculateTaxAmount pozitif kâr', () => {
    expect(calculateTaxAmount(40_800_000)).toBe(10_200_000)
    expect(calculateTaxAmount(100)).toBe(25)
    expect(calculateTaxAmount(1)).toBe(0.25)
  })

  test('calculateTaxAmount zarar/sıfır → 0', () => {
    expect(calculateTaxAmount(0)).toBe(0)
    expect(calculateTaxAmount(-5_000_000)).toBe(0)
    expect(calculateTaxAmount(-1)).toBe(0)
  })

  test('calculateNetProfit vergi sonrası', () => {
    expect(calculateNetProfit(40_800_000)).toBe(30_600_000)
    expect(calculateNetProfit(100)).toBe(75)
    expect(calculateNetProfit(0)).toBe(0)
    expect(calculateNetProfit(-5_000_000)).toBe(-5_000_000) // zarar: vergi=0, net=brüt
  })

  test('buildTaxProvisionTransaction pozitif kâr — 691 DR + 370 CR', () => {
    const tx = buildTaxProvisionTransaction(40_800_000, 'A20', 'OPERATIONAL_MARGIN')
    expect(tx).not.toBeNull()
    expect(tx!.transactionId).toBe('A20_TAX_PROVISION')
    expect(tx!.semanticType).toBe('OPERATIONAL_MARGIN')
    expect(tx!.legs).toHaveLength(2)
    // 691 DEBIT
    expect(tx!.legs[0]).toMatchObject({
      accountCode: '691',
      side: 'DEBIT',
      amount: 10_200_000,
    })
    // 370 CREDIT
    expect(tx!.legs[1]).toMatchObject({
      accountCode: '370',
      side: 'CREDIT',
      amount: 10_200_000,
    })
    // Denklik
    const debit  = tx!.legs.filter(l => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0)
    const credit = tx!.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  test('buildTaxProvisionTransaction zarar/sıfır → null', () => {
    expect(buildTaxProvisionTransaction(-5_000_000, 'A20', 'OPERATIONAL_MARGIN')).toBeNull()
    expect(buildTaxProvisionTransaction(0, 'A20', 'OPERATIONAL_MARGIN')).toBeNull()
  })

  test('buildNetProfitTransferTransaction pozitif kâr — 690 DR NET + 590 CR NET', () => {
    const tx = buildNetProfitTransferTransaction(40_800_000, 'A20', 'OPERATIONAL_MARGIN')
    expect(tx).not.toBeNull()
    expect(tx!.transactionId).toBe('A20_NET_PROFIT_TRANSFER')
    expect(tx!.semanticType).toBe('OPERATIONAL_MARGIN')
    expect(tx!.legs).toHaveLength(2)
    // 690 DEBIT NET
    expect(tx!.legs[0]).toMatchObject({
      accountCode: '690',
      side: 'DEBIT',
      amount: 30_600_000,
    })
    // 590 CREDIT NET
    expect(tx!.legs[1]).toMatchObject({
      accountCode: '590',
      side: 'CREDIT',
      amount: 30_600_000,
    })
    // Denklik
    const debit  = tx!.legs.filter(l => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0)
    const credit = tx!.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  test('buildNetProfitTransferTransaction zarar/sıfır → null', () => {
    expect(buildNetProfitTransferTransaction(0, 'A20', 'OPERATIONAL_MARGIN')).toBeNull()
    expect(buildNetProfitTransferTransaction(-5_000_000, 'A14', 'FINANCE_COST_REDUCTION')).toBeNull()
  })

})
