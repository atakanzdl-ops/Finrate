/**
 * Faz 7.3.13 — Verimsizlik Tipleri Mali Dil
 *
 * Her InefficiencyType için:
 *   - title:          Kısa başlık (özet tabında gösterilir)
 *   - description:    Sorun tarifi (profesyonel kredi raporu dili)
 *   - ifNotAddressed: Çözülmezse ne olur (profesyonel kredi raporu dili)
 *
 * Record<InefficiencyType, ...> → yeni tip eklenirse TypeScript compile error verir.
 */

import type { InefficiencyType } from './assetProductivity'

export interface InefficiencyNarrative {
  /** Kısa başlık — özet tabı "Temel Problem" bölümünde gösterilir */
  title: string
  /** Sorun tarifi — profesyonel bankacı dili */
  description: string
  /** Çözülmezse ne olur — "Aksiyon Alınmazsa" bölümünde gösterilir */
  ifNotAddressed: string
}

export const INEFFICIENCY_NARRATIVES: Record<InefficiencyType, InefficiencyNarrative> = {

  ADVANCES_LOCK: {
    title: 'Sipariş Avanslarında Yoğunlaşma',
    description:
      'Verilen sipariş avanslarının yüksek seviyede seyretmesi, işletme kaynaklarının önemli ' +
      'bölümünün avans hesaplarında yoğunlaşmasına neden olmaktadır.',
    ifNotAddressed:
      'Tedarikçi tarafındaki bağımlılık derinleşir, sınırlı sayıda tedarikçi üzerinde ' +
      'yoğunlaşan kaynak yapısı operasyonel sürekliliği riske atabilir.',
  },

  INVENTORY_LOCK: {
    title: 'Stok Yoğunluğu',
    description:
      'Stok büyüklüğünün satış hacmine kıyasla yüksek seyretmesi, işletme sermayesinin ' +
      'stok kalemlerinde yoğunlaşmasına yol açmaktadır.',
    ifNotAddressed:
      'İşletme sermayesi stok kalemlerinde bağlı kalmaya devam eder, fire ve eskime ' +
      'kaynaklı değer kayıpları büyür ve nakit dönüş hızı daha da yavaşlar.',
  },

  RECEIVABLE_SLOWDOWN: {
    title: 'Tahsilat Sürelerinde Uzama',
    description:
      'Ticari alacak tahsil sürelerinin uzaması, nakit dönüş hızını yavaşlatmakta ve ' +
      'likidite yönetimini zorlaştırmaktadır.',
    ifNotAddressed:
      'Tahsilat süreçlerinin yavaş seyretmeye devam etmesi durumunda dış kaynak finansman ' +
      'ihtiyacı kaçınılmaz hale gelir, finansman maliyetleri artar.',
  },

  WIP_LOCK: {
    title: 'Yarı Mamul Yoğunluğu',
    description:
      'Yarı mamul ve devam eden iş kalemlerinin aktif içindeki ağırlığının yüksek ' +
      'seyretmesi, proje dönüşüm sürecinde takılı kalan kaynakların hasılata dönüşüm ' +
      'hızını yavaşlatmaktadır.',
    ifNotAddressed:
      'Tamamlanmamış üretim ve devam eden iş kalemlerinin yüksek seyretmesi, işletme ' +
      'sermayesinin yarı mamul yapısında yoğunlaşmasına ve gelir dönüş hızının ' +
      'yavaşlamasına neden olmaktadır.',
  },

  FIXED_ASSET_UNDERUTILIZATION: {
    title: 'Aktif Yapısında Verimlilik Sorunu',
    description:
      'Aktif büyüklüğünün gelir üretim kapasitesine kıyasla yüksek kalması, varlık ' +
      'kullanım etkinliğini sınırlandırmaktadır.',
    ifNotAddressed:
      'Atıl kapasite kalıcılaşır, varlık başına gelir üretimi gerilemeye devam eder ' +
      've sermayenin getiri performansı zayıflar.',
  },

  SALES_ASSET_MISMATCH: {
    title: 'Aktif Devir Hızında Zayıflama',
    description:
      'Şirket varlıklarının satış yaratma kapasitesindeki gerileme, aktif devir hızının ' +
      'düşük seviyelerde seyretmesine neden olmaktadır.',
    ifNotAddressed:
      'Varlıkların gelir yaratma kapasitesindeki zayıflığın sürmesi, sermaye kullanım ' +
      'etkinliğini azaltmakta ve büyüme sürecinde ek finansman ihtiyacını artırmaktadır.',
  },

  OPERATING_YIELD_GAP: {
    title: 'Operasyonel Verimlilik Açığı',
    description:
      'Operasyonel kârın aktif büyüklüğüne kıyasla zayıf seyretmesi, varlık kullanımının ' +
      'kâra dönüşüm gücünde yetersizlik olduğuna işaret etmektedir.',
    ifNotAddressed:
      'Aktif başına yaratılan operasyonel kârlılığın düşük seyretmesi, borç servis ' +
      'kapasitesi ve finansal dayanıklılık üzerinde baskı oluşturabilmektedir.',
  },

  CASH_GENERATION_GAP: {
    title: 'Nakit Üretim Yetersizliği',
    description:
      'Faaliyet kaynaklı nakit girişinin sınırlı kalması, şirketin iç kaynaklarla ' +
      'finansman üretme kapasitesi üzerinde baskı oluşturmaktadır.',
    ifNotAddressed:
      'Operasyonel faaliyetlerden nakit üretim kapasitesinin sınırlı kalması, yatırım ' +
      've büyüme ihtiyaçlarının iç kaynaklarla karşılanmasını zorlaştırmaktadır.',
  },

}

// ─── SEVERITY YARDIMCILARI ────────────────────────────────────────────────────

/** Severity kodunun Türkçe etiketleri */
export const SEVERITY_LABELS = {
  CRITICAL: 'KRİTİK',
  SEVERE:   'CİDDİ',
  MODERATE: 'ORTA',
  MILD:     'HAFİF',
} as const

/** Gösterim önceliği (CRITICAL en önce) */
export const SEVERITY_ORDER: Array<'CRITICAL' | 'SEVERE' | 'MODERATE' | 'MILD'> =
  ['CRITICAL', 'SEVERE', 'MODERATE', 'MILD']

/** MILD gizli — yalnız bu seviyeler UI'a taşınır */
export const VISIBLE_SEVERITIES: ReadonlyArray<'CRITICAL' | 'SEVERE' | 'MODERATE'> =
  ['CRITICAL', 'SEVERE', 'MODERATE']
