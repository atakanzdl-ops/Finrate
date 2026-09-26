// TEK DEĞERLENDİRME KURALI — bir oran için durum (iyi / uyarı / risk / uygulanamaz / eksik)
// ve tek cümlelik yorum buradan üretilir. Rapor tablosu, özet kutuları, Hızlı Teşhis ve
// güçlü/izleme listeleri aynı hükmü vermek için bunu kullanır. Skor motoruna dokunmaz.

export type AssessStatus = 'iyi' | 'uyari' | 'risk' | 'na' | 'eksik'
export type Direction = 'up' | 'down'

export interface Assessment {
  status: AssessStatus
  /** Tablo/rozet etiketi: İyi, Uyarı, Risk, Uygulanamaz, Veri yok */
  label: string
  /** Kısa yorum cümlesi (rapor ve ekran) */
  sentence: string
  /** Sektöre göre oran (up: değer/sektör, down: sektör/değer); na/eksik'te null */
  relative: number | null
}

export const STATUS_LABEL: Record<AssessStatus, string> = {
  iyi: 'İyi', uyari: 'Uyarı', risk: 'Risk', na: 'Uygulanamaz', eksik: 'Veri yok',
}

// Eşikler — formatters.ratioStatus ile aynı (tek kaynak burasıdır)
export const GOOD_RELATIVE = 1.10
export const WARN_RELATIVE = 0.75

export function assessStatus(
  value: number | null | undefined,
  sectorValue: number | null | undefined,
  direction: Direction,
): { status: 'iyi' | 'uyari' | 'risk' | 'eksik'; relative: number | null } {
  if (value == null || isNaN(value)) return { status: 'eksik', relative: null }
  if (sectorValue == null || sectorValue === 0) return { status: 'uyari', relative: null }
  const relative = direction === 'up' ? value / sectorValue : sectorValue / value
  if (!isFinite(relative) || relative < 0) return { status: 'uyari', relative: null }
  if (relative >= GOOD_RELATIVE) return { status: 'iyi', relative }
  if (relative >= WARN_RELATIVE) return { status: 'uyari', relative }
  return { status: 'risk', relative }
}

export type MetricKey =
  | 'currentRatio' | 'quickRatio' | 'cashRatio' | 'cashConversionCycle'
  | 'grossMargin' | 'ebitdaMargin' | 'netProfitMargin' | 'roa' | 'roe' | 'revenueGrowth'
  | 'debtToEquity' | 'debtToAssets' | 'debtToEbitda' | 'interestCoverage' | 'shortTermDebtRatio'
  | 'assetTurnover' | 'receivablesTurnoverDays' | 'inventoryTurnoverDays' | 'payablesTurnoverDays'

interface MetricSpec {
  name: string
  direction: Direction
  text: { iyi: string; uyari: string; risk: string }
}

export const METRIC_SPEC: Record<MetricKey, MetricSpec> = {
  currentRatio:            { name: 'Cari oran',                direction: 'up',   text: { iyi: 'Sektör ortalamasının üzerinde; kısa vadeli borç ödeme gücü rahat.', uyari: 'Sektör ortalamasına yakın; likidite yeterli ancak tampon dar.', risk: 'Sektör ortalamasının belirgin altında; kısa vadeli yükümlülükler için likidite baskısı var.' } },
  quickRatio:              { name: 'Asit-test oranı',          direction: 'up',   text: { iyi: 'Stoklar hariç de kısa vadeli borçlar karşılanabiliyor.', uyari: 'Stok satışı olmadan likidite sınırda.', risk: 'Stoklar dışarıda bırakıldığında kısa vadeli borçlar karşılanamıyor.' } },
  cashRatio:               { name: 'Nakit oranı',              direction: 'up',   text: { iyi: 'Nakit ve benzerleri güçlü; acil ödemeler için tampon var.', uyari: 'Nakit tamponu sınırlı; tahsilat aksarsa baskı oluşur.', risk: 'Nakit tamponu zayıf; ödemeler tahsilata bağımlı.' } },
  cashConversionCycle:     { name: 'Nakit dönüşüm çevrimi',    direction: 'down', text: { iyi: 'Sektörden kısa; işletme sermayesi verimli dönüyor.', uyari: 'Sektör düzeyinde; alacak ve stok süresi izlenmeli.', risk: 'Sektörden belirgin uzun; nakit uzun süre alacak ve stokta bağlı kalıyor.' } },
  grossMargin:             { name: 'Brüt kâr marjı',           direction: 'up',   text: { iyi: 'Sektörün üzerinde; fiyatlama ve maliyet yapısı güçlü.', uyari: 'Sektör düzeyinde; maliyet baskısına karşı sınırlı alan.', risk: 'Sektörün altında; satılan mal/hizmet maliyeti kârı eritiyor.' } },
  ebitdaMargin:            { name: 'FAVÖK marjı',              direction: 'up',   text: { iyi: 'Faaliyetlerden güçlü nakit yaratma kapasitesi.', uyari: 'Faaliyet kârlılığı sektör düzeyinde; verimlilik artışı için alan var.', risk: 'Faaliyet kârlılığı zayıf; borç servisi ve yatırım için iç kaynak kısıtlı.' } },
  netProfitMargin:         { name: 'Net kâr marjı',            direction: 'up',   text: { iyi: 'Sektörün üzerinde net kârlılık; özkaynak birikimi sağlıklı.', uyari: 'Net kârlılık sektöre yakın; finansman ve vergi yükü izlenmeli.', risk: 'Net kârlılık sektörün altında; kârlılık iyileştirmesi öncelikli.' } },
  roa:                     { name: 'Aktif kârlılığı (ROA)',    direction: 'up',   text: { iyi: 'Varlıklar sektörden daha verimli kâr üretiyor.', uyari: 'Varlık verimliliği sektör düzeyinde.', risk: 'Varlıklar yeterli kâr üretmiyor; atıl kapasite veya düşük marj.' } },
  roe:                     { name: 'Özkaynak kârlılığı (ROE)', direction: 'up',   text: { iyi: 'Ortakların sermayesi sektörden yüksek getiri sağlıyor.', uyari: 'Özkaynak getirisi sektör düzeyinde.', risk: 'Özkaynak getirisi düşük; sermaye verimsiz kullanılıyor.' } },
  revenueGrowth:           { name: 'Ciro büyümesi',            direction: 'up',   text: { iyi: 'Ciro sektörden hızlı büyüyor.', uyari: 'Ciro büyümesi sektör düzeyinde.', risk: 'Ciro büyümesi sektörün gerisinde.' } },
  debtToEquity:            { name: 'Borç / özkaynak',          direction: 'down', text: { iyi: 'Kaldıraç sektörden düşük; borçlanma kapasitesi mevcut.', uyari: 'Kaldıraç sektör düzeyinde; ek borç ihtiyatla değerlendirilmeli.', risk: 'Kaldıraç sektörün belirgin üzerinde; borç yapısı riskli.' } },
  debtToAssets:            { name: 'Borç / aktif',             direction: 'down', text: { iyi: 'Varlıkların ağırlığı özkaynakla finanse edilmiş.', uyari: 'Borçla finansman sektör düzeyinde.', risk: 'Varlıkların büyük bölümü borçla finanse edilmiş.' } },
  debtToEbitda:            { name: 'Net borç / FAVÖK',         direction: 'down', text: { iyi: 'Net borç FAVÖK ile kısa sürede ödenebilir.', uyari: 'Borç geri ödeme süresi sektör düzeyinde.', risk: 'Net borç FAVÖK\'e göre yüksek; geri ödeme süresi uzun.' } },
  interestCoverage:        { name: 'Faiz karşılama',           direction: 'up',   text: { iyi: 'Faiz yükü faaliyet kârıyla rahat karşılanıyor.', uyari: 'Faiz yükü karşılanıyor ancak marj dar.', risk: 'Faaliyet kârı faiz yükünü zor karşılıyor.' } },
  shortTermDebtRatio:      { name: 'KV borç oranı',            direction: 'down', text: { iyi: 'Borçların vadesi dengeli; yakın vadeli yenileme baskısı düşük.', uyari: 'Kısa vadeli borç payı sektör düzeyinde.', risk: 'Borçlar kısa vadede yoğunlaşmış; yeniden finansman riski.' } },
  assetTurnover:           { name: 'Aktif devir hızı',         direction: 'up',   text: { iyi: 'Varlıklar sektörden hızlı ciroya dönüyor.', uyari: 'Varlık devir hızı sektör düzeyinde.', risk: 'Varlıklar ciroya yavaş dönüyor; atıl varlık olabilir.' } },
  receivablesTurnoverDays: { name: 'Alacak tahsil süresi',     direction: 'down', text: { iyi: 'Alacaklar sektörden hızlı tahsil ediliyor.', uyari: 'Tahsil süresi sektör düzeyinde.', risk: 'Tahsil süresi sektörden uzun; alacak kalitesi izlenmeli.' } },
  inventoryTurnoverDays:   { name: 'Stok tutma süresi',        direction: 'down', text: { iyi: 'Stok sektörden hızlı devrediyor.', uyari: 'Stok süresi sektör düzeyinde.', risk: 'Stok sektörden uzun süre bekliyor; nakit stokta bağlı.' } },
  payablesTurnoverDays:    { name: 'Borç ödeme süresi',        direction: 'up',   text: { iyi: 'Tedarikçi finansmanı etkin kullanılıyor.', uyari: 'Ödeme süresi sektör düzeyinde.', risk: 'Tedarikçilere sektörden hızlı ödeniyor; nakit erken çıkıyor.' } },
}

export function assess(metric: MetricKey, value: number | null | undefined, sectorValue: number | null | undefined): Assessment {
  const spec = METRIC_SPEC[metric]

  // Uygulanamaz durumlar (eksik veya risk gibi gösterilmez)
  if (metric === 'interestCoverage' && value != null && value >= 9999) {
    return { status: 'na', label: STATUS_LABEL.na, sentence: 'Finansal borç ve faiz gideri yok — oran uygulanamaz; borçsuzluk risk değildir.', relative: null }
  }
  if (metric === 'debtToEbitda' && value != null && value < 0) {
    return { status: 'na', label: 'Net nakit', sentence: 'Net nakit pozisyonu — nakit finansal borcu aşıyor; oran uygulanamaz, borç riski yok.', relative: null }
  }
  if (metric === 'debtToEbitda' && value != null && value >= 99) {
    return { status: 'risk', label: STATUS_LABEL.risk, sentence: 'FAVÖK sıfır veya negatif; mevcut kârlılıkla borç geri ödenemez.', relative: null }
  }

  const { status, relative } = assessStatus(value, sectorValue, spec.direction)
  if (status === 'eksik') return { status, label: STATUS_LABEL.eksik, sentence: `${spec.name} için veri girilmemiş.`, relative: null }
  const s = status as 'iyi' | 'uyari' | 'risk'
  return { status: s, label: STATUS_LABEL[s], sentence: spec.text[s], relative }
}

/** Genel değerlendirme için durum dağılımı: kaç iyi / uyarı / risk, en güçlü ve en zayıf metrikler. */
export function summarizeAssessments(
  ratios: Partial<Record<MetricKey, number | null>>,
  bm: Partial<Record<string, number | null>>,
  keys: MetricKey[] = ['currentRatio', 'quickRatio', 'netProfitMargin', 'ebitdaMargin', 'roe', 'debtToEquity', 'debtToEbitda', 'interestCoverage', 'receivablesTurnoverDays', 'inventoryTurnoverDays', 'assetTurnover'],
) {
  const BM_KEY: Partial<Record<MetricKey, string>> = { receivablesTurnoverDays: 'receivablesDays', inventoryTurnoverDays: 'inventoryDays' }
  const items = keys.map(k => ({ key: k, name: METRIC_SPEC[k].name, a: assess(k, ratios[k], bm[BM_KEY[k] ?? k] as number | null | undefined) }))
    .filter(i => i.a.status !== 'eksik')
  const counted = items.filter(i => i.a.status !== 'na')
  const good = counted.filter(i => i.a.status === 'iyi')
  const warn = counted.filter(i => i.a.status === 'uyari')
  const risk = counted.filter(i => i.a.status === 'risk')
  const byRel = (arr: typeof items, desc: boolean) => [...arr].filter(i => i.a.relative != null).sort((x, y) => desc ? (y.a.relative! - x.a.relative!) : (x.a.relative! - y.a.relative!))
  return {
    total: counted.length,
    good: good.length, warn: warn.length, risk: risk.length,
    strongest: byRel(good, true).slice(0, 2).map(i => i.name),
    weakest:   byRel(risk.length ? risk : warn, false).slice(0, 2).map(i => i.name),
    notApplicable: items.filter(i => i.a.status === 'na').map(i => i.name),
  }
}
