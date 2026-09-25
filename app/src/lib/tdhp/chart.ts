// Tekdüzen Hesap Planı — bilanço (1xx–5xx) ve gelir tablosu (6xx) ana hesapları.
// 7xx maliyet hesapları bilinçli olarak kapsam dışı.
// contra: true → tabloda eksi gösterilir ve grup toplamından düşülür.

export type TdhpSection =
  | 'DONEN_VARLIKLAR' | 'DURAN_VARLIKLAR'
  | 'KV_YABANCI_KAYNAKLAR' | 'UV_YABANCI_KAYNAKLAR' | 'OZKAYNAKLAR'
  | 'GELIR_TABLOSU'

export interface TdhpAccount {
  code: string
  name: string
  contra?: boolean
}

export interface TdhpGroup {
  code: string          // 2 haneli
  name: string
  section: TdhpSection
  accounts: TdhpAccount[]
}

export const TDHP_SECTION_LABEL: Record<TdhpSection, string> = {
  DONEN_VARLIKLAR:      'I. DÖNEN VARLIKLAR',
  DURAN_VARLIKLAR:      'II. DURAN VARLIKLAR',
  KV_YABANCI_KAYNAKLAR: 'III. KISA VADELİ YABANCI KAYNAKLAR',
  UV_YABANCI_KAYNAKLAR: 'IV. UZUN VADELİ YABANCI KAYNAKLAR',
  OZKAYNAKLAR:          'V. ÖZ KAYNAKLAR',
  GELIR_TABLOSU:        'GELİR TABLOSU',
}

const a = (code: string, name: string, contra = false): TdhpAccount => ({ code, name, ...(contra && { contra }) })

export const TDHP_GROUPS: TdhpGroup[] = [
  // ── I. DÖNEN VARLIKLAR ────────────────────────────────────────────────────
  { code: '10', name: 'Hazır Değerler', section: 'DONEN_VARLIKLAR', accounts: [
    a('100', 'Kasa'), a('101', 'Alınan Çekler'), a('102', 'Bankalar'),
    a('103', 'Verilen Çekler ve Ödeme Emirleri (-)', true), a('108', 'Diğer Hazır Değerler'),
  ]},
  { code: '11', name: 'Menkul Kıymetler', section: 'DONEN_VARLIKLAR', accounts: [
    a('110', 'Hisse Senetleri'), a('111', 'Özel Kesim Tahvil, Senet ve Bonoları'),
    a('112', 'Kamu Kesimi Tahvil, Senet ve Bonoları'), a('118', 'Diğer Menkul Kıymetler'),
    a('119', 'Menkul Kıymetler Değer Düşüklüğü Karşılığı (-)', true),
  ]},
  { code: '12', name: 'Ticari Alacaklar', section: 'DONEN_VARLIKLAR', accounts: [
    a('120', 'Alıcılar'), a('121', 'Alacak Senetleri'), a('122', 'Alacak Senetleri Reeskontu (-)', true),
    a('124', 'Kazanılmamış Finansal Kiralama Faiz Gelirleri (-)', true),
    a('126', 'Verilen Depozito ve Teminatlar'), a('127', 'Diğer Ticari Alacaklar'),
    a('128', 'Şüpheli Ticari Alacaklar'), a('129', 'Şüpheli Ticari Alacaklar Karşılığı (-)', true),
  ]},
  { code: '13', name: 'Diğer Alacaklar', section: 'DONEN_VARLIKLAR', accounts: [
    a('131', 'Ortaklardan Alacaklar'), a('132', 'İştiraklerden Alacaklar'), a('133', 'Bağlı Ortaklıklardan Alacaklar'),
    a('135', 'Personelden Alacaklar'), a('136', 'Diğer Çeşitli Alacaklar'),
    a('137', 'Diğer Alacak Senetleri Reeskontu (-)', true), a('138', 'Şüpheli Diğer Alacaklar'),
    a('139', 'Şüpheli Diğer Alacaklar Karşılığı (-)', true),
  ]},
  { code: '15', name: 'Stoklar', section: 'DONEN_VARLIKLAR', accounts: [
    a('150', 'İlk Madde ve Malzeme'), a('151', 'Yarı Mamuller - Üretim'), a('152', 'Mamuller'),
    a('153', 'Ticari Mallar'), a('157', 'Diğer Stoklar'),
    a('158', 'Stok Değer Düşüklüğü Karşılığı (-)', true), a('159', 'Verilen Sipariş Avansları'),
  ]},
  { code: '17', name: 'Yıllara Yaygın İnşaat ve Onarım Maliyetleri', section: 'DONEN_VARLIKLAR', accounts: [
    a('170', 'Yıllara Yaygın İnşaat ve Onarım Maliyetleri'), a('178', 'Yıllara Yaygın İnşaat Enflasyon Düzeltme Hesabı'),
    a('179', 'Taşeronlara Verilen Avanslar'),
  ]},
  { code: '18', name: 'Gelecek Aylara Ait Giderler ve Gelir Tahakkukları', section: 'DONEN_VARLIKLAR', accounts: [
    a('180', 'Gelecek Aylara Ait Giderler'), a('181', 'Gelir Tahakkukları'),
  ]},
  { code: '19', name: 'Diğer Dönen Varlıklar', section: 'DONEN_VARLIKLAR', accounts: [
    a('190', 'Devreden KDV'), a('191', 'İndirilecek KDV'), a('192', 'Diğer KDV'),
    a('193', 'Peşin Ödenen Vergiler ve Fonlar'), a('195', 'İş Avansları'), a('196', 'Personel Avansları'),
    a('197', 'Sayım ve Tesellüm Noksanları'), a('198', 'Diğer Çeşitli Dönen Varlıklar'),
    a('199', 'Diğer Dönen Varlıklar Karşılığı (-)', true),
  ]},

  // ── II. DURAN VARLIKLAR ───────────────────────────────────────────────────
  { code: '22', name: 'Ticari Alacaklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('220', 'Alıcılar'), a('221', 'Alacak Senetleri'), a('222', 'Alacak Senetleri Reeskontu (-)', true),
    a('224', 'Kazanılmamış Finansal Kiralama Faiz Gelirleri (-)', true),
    a('226', 'Verilen Depozito ve Teminatlar'), a('229', 'Şüpheli Alacaklar Karşılığı (-)', true),
  ]},
  { code: '23', name: 'Diğer Alacaklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('231', 'Ortaklardan Alacaklar'), a('232', 'İştiraklerden Alacaklar'), a('233', 'Bağlı Ortaklıklardan Alacaklar'),
    a('235', 'Personelden Alacaklar'), a('236', 'Diğer Çeşitli Alacaklar'),
    a('237', 'Diğer Alacak Senetleri Reeskontu (-)', true), a('239', 'Şüpheli Diğer Alacaklar Karşılığı (-)', true),
  ]},
  { code: '24', name: 'Mali Duran Varlıklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('240', 'Bağlı Menkul Kıymetler'), a('241', 'Bağlı Menkul Kıymetler Değer Düşüklüğü Karşılığı (-)', true),
    a('242', 'İştirakler'), a('243', 'İştiraklere Sermaye Taahhütleri (-)', true),
    a('244', 'İştirakler Sermaye Payları Değer Düşüklüğü Karşılığı (-)', true),
    a('245', 'Bağlı Ortaklıklar'), a('246', 'Bağlı Ortaklıklara Sermaye Taahhütleri (-)', true),
    a('247', 'Bağlı Ortaklıklar Sermaye Payları Değer Düşüklüğü Karşılığı (-)', true),
    a('248', 'Diğer Mali Duran Varlıklar'), a('249', 'Diğer Mali Duran Varlıklar Karşılığı (-)', true),
  ]},
  { code: '25', name: 'Maddi Duran Varlıklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('250', 'Arazi ve Arsalar'), a('251', 'Yeraltı ve Yerüstü Düzenleri'), a('252', 'Binalar'),
    a('253', 'Tesis, Makine ve Cihazlar'), a('254', 'Taşıtlar'), a('255', 'Demirbaşlar'),
    a('256', 'Diğer Maddi Duran Varlıklar'), a('257', 'Birikmiş Amortismanlar (-)', true),
    a('258', 'Yapılmakta Olan Yatırımlar'), a('259', 'Verilen Avanslar'),
  ]},
  { code: '26', name: 'Maddi Olmayan Duran Varlıklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('260', 'Haklar'), a('261', 'Şerefiye'), a('262', 'Kuruluş ve Örgütlenme Giderleri'),
    a('263', 'Araştırma ve Geliştirme Giderleri'), a('264', 'Özel Maliyetler'),
    a('267', 'Diğer Maddi Olmayan Duran Varlıklar'), a('268', 'Birikmiş Amortismanlar (-)', true),
    a('269', 'Verilen Avanslar'),
  ]},
  { code: '27', name: 'Özel Tükenmeye Tabi Varlıklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('271', 'Arama Giderleri'), a('272', 'Hazırlık ve Geliştirme Giderleri'),
    a('277', 'Diğer Özel Tükenmeye Tabi Varlıklar'), a('278', 'Birikmiş Tükenme Payları (-)', true),
    a('279', 'Verilen Avanslar'),
  ]},
  { code: '28', name: 'Gelecek Yıllara Ait Giderler ve Gelir Tahakkukları', section: 'DURAN_VARLIKLAR', accounts: [
    a('280', 'Gelecek Yıllara Ait Giderler'), a('281', 'Gelir Tahakkukları'),
  ]},
  { code: '29', name: 'Diğer Duran Varlıklar', section: 'DURAN_VARLIKLAR', accounts: [
    a('291', 'Gelecek Yıllarda İndirilecek KDV'), a('292', 'Diğer KDV'),
    a('293', 'Gelecek Yıllar İhtiyacı Stoklar'), a('294', 'Elden Çıkarılacak Stoklar ve Maddi Duran Varlıklar'),
    a('295', 'Peşin Ödenen Vergiler ve Fonlar'), a('297', 'Diğer Çeşitli Duran Varlıklar'),
    a('298', 'Stok Değer Düşüklüğü Karşılığı (-)', true), a('299', 'Birikmiş Amortismanlar (-)', true),
  ]},

  // ── III. KISA VADELİ YABANCI KAYNAKLAR ────────────────────────────────────
  { code: '30', name: 'Mali Borçlar', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('300', 'Banka Kredileri'), a('301', 'Finansal Kiralama İşlemlerinden Borçlar'),
    a('302', 'Ertelenmiş Finansal Kiralama Borçlanma Maliyetleri (-)', true),
    a('303', 'Uzun Vadeli Kredilerin Anapara Taksitleri ve Faizleri'),
    a('304', 'Tahvil Anapara Borç, Taksit ve Faizleri'), a('305', 'Çıkarılmış Bonolar ve Senetler'),
    a('306', 'Çıkarılmış Diğer Menkul Kıymetler'), a('308', 'Menkul Kıymetler İhraç Farkı (-)', true),
    a('309', 'Diğer Mali Borçlar'),
  ]},
  { code: '32', name: 'Ticari Borçlar', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('320', 'Satıcılar'), a('321', 'Borç Senetleri'), a('322', 'Borç Senetleri Reeskontu (-)', true),
    a('326', 'Alınan Depozito ve Teminatlar'), a('329', 'Diğer Ticari Borçlar'),
  ]},
  { code: '33', name: 'Diğer Borçlar', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('331', 'Ortaklara Borçlar'), a('332', 'İştiraklere Borçlar'), a('333', 'Bağlı Ortaklıklara Borçlar'),
    a('335', 'Personele Borçlar'), a('336', 'Diğer Çeşitli Borçlar'),
    a('337', 'Diğer Borç Senetleri Reeskontu (-)', true),
  ]},
  { code: '34', name: 'Alınan Avanslar', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('340', 'Alınan Sipariş Avansları'), a('349', 'Alınan Diğer Avanslar'),
  ]},
  { code: '35', name: 'Yıllara Yaygın İnşaat ve Onarım Hakedişleri', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('350', 'Yıllara Yaygın İnşaat ve Onarım Hakediş Bedelleri'), a('358', 'Yıllara Yaygın İnşaat Enflasyon Düzeltme Hesabı'),
  ]},
  { code: '36', name: 'Ödenecek Vergi ve Diğer Yükümlülükler', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('360', 'Ödenecek Vergi ve Fonlar'), a('361', 'Ödenecek Sosyal Güvenlik Kesintileri'),
    a('368', 'Vadesi Geçmiş, Ertelenmiş veya Taksitlendirilmiş Vergi ve Diğer Yükümlülükler'),
    a('369', 'Ödenecek Diğer Yükümlülükler'),
  ]},
  { code: '37', name: 'Borç ve Gider Karşılıkları', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('370', 'Dönem Karı Vergi ve Diğer Yasal Yükümlülük Karşılıkları'),
    a('371', 'Dönem Karının Peşin Ödenen Vergi ve Diğer Yükümlülükleri (-)', true),
    a('372', 'Kıdem Tazminatı Karşılığı'), a('373', 'Maliyet Giderleri Karşılığı'),
    a('379', 'Diğer Borç ve Gider Karşılıkları'),
  ]},
  { code: '38', name: 'Gelecek Aylara Ait Gelirler ve Gider Tahakkukları', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('380', 'Gelecek Aylara Ait Gelirler'), a('381', 'Gider Tahakkukları'),
  ]},
  { code: '39', name: 'Diğer Kısa Vadeli Yabancı Kaynaklar', section: 'KV_YABANCI_KAYNAKLAR', accounts: [
    a('391', 'Hesaplanan KDV'), a('392', 'Diğer KDV'), a('393', 'Merkez ve Şubeler Cari Hesabı'),
    a('397', 'Sayım ve Tesellüm Fazlaları'), a('399', 'Diğer Çeşitli Yabancı Kaynaklar'),
  ]},

  // ── IV. UZUN VADELİ YABANCI KAYNAKLAR ─────────────────────────────────────
  { code: '40', name: 'Mali Borçlar', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('400', 'Banka Kredileri'), a('401', 'Finansal Kiralama İşlemlerinden Borçlar'),
    a('402', 'Ertelenmiş Finansal Kiralama Borçlanma Maliyetleri (-)', true),
    a('405', 'Çıkarılmış Tahviller'), a('407', 'Çıkarılmış Diğer Menkul Kıymetler'),
    a('408', 'Menkul Kıymetler İhraç Farkı (-)', true), a('409', 'Diğer Mali Borçlar'),
  ]},
  { code: '42', name: 'Ticari Borçlar', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('420', 'Satıcılar'), a('421', 'Borç Senetleri'), a('422', 'Borç Senetleri Reeskontu (-)', true),
    a('426', 'Alınan Depozito ve Teminatlar'), a('429', 'Diğer Ticari Borçlar'),
  ]},
  { code: '43', name: 'Diğer Borçlar', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('431', 'Ortaklara Borçlar'), a('432', 'İştiraklere Borçlar'), a('433', 'Bağlı Ortaklıklara Borçlar'),
    a('436', 'Diğer Çeşitli Borçlar'), a('437', 'Diğer Borç Senetleri Reeskontu (-)', true),
    a('438', 'Kamuya Olan Ertelenmiş veya Taksitlendirilmiş Borçlar'),
  ]},
  { code: '44', name: 'Alınan Avanslar', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('440', 'Alınan Sipariş Avansları'), a('449', 'Alınan Diğer Avanslar'),
  ]},
  { code: '47', name: 'Borç ve Gider Karşılıkları', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('472', 'Kıdem Tazminatı Karşılığı'), a('479', 'Diğer Borç ve Gider Karşılıkları'),
  ]},
  { code: '48', name: 'Gelecek Yıllara Ait Gelirler ve Gider Tahakkukları', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('480', 'Gelecek Yıllara Ait Gelirler'), a('481', 'Gider Tahakkukları'),
  ]},
  { code: '49', name: 'Diğer Uzun Vadeli Yabancı Kaynaklar', section: 'UV_YABANCI_KAYNAKLAR', accounts: [
    a('492', 'Gelecek Yıllara Ertelenen veya Terkin Edilecek KDV'), a('493', 'Tesise Katılma Payları'),
    a('499', 'Diğer Çeşitli Uzun Vadeli Yabancı Kaynaklar'),
  ]},

  // ── V. ÖZ KAYNAKLAR ───────────────────────────────────────────────────────
  { code: '50', name: 'Ödenmiş Sermaye', section: 'OZKAYNAKLAR', accounts: [
    a('500', 'Sermaye'), a('501', 'Ödenmemiş Sermaye (-)', true),
    a('502', 'Sermaye Düzeltmesi Olumlu Farkları'), a('503', 'Sermaye Düzeltmesi Olumsuz Farkları (-)', true),
  ]},
  { code: '52', name: 'Sermaye Yedekleri', section: 'OZKAYNAKLAR', accounts: [
    a('520', 'Hisse Senedi İhraç Primleri'), a('521', 'Hisse Senedi İptal Karları'),
    a('522', 'Maddi Duran Varlık Yeniden Değerleme Artışları'), a('523', 'İştirakler Yeniden Değerleme Artışları'),
    a('524', 'Maliyet Artışları Fonu'), a('529', 'Diğer Sermaye Yedekleri'),
  ]},
  { code: '54', name: 'Kar Yedekleri', section: 'OZKAYNAKLAR', accounts: [
    a('540', 'Yasal Yedekler'), a('541', 'Statü Yedekleri'), a('542', 'Olağanüstü Yedekler'),
    a('548', 'Diğer Kar Yedekleri'), a('549', 'Özel Fonlar'),
  ]},
  { code: '57', name: 'Geçmiş Yıllar Karları', section: 'OZKAYNAKLAR', accounts: [
    a('570', 'Geçmiş Yıllar Karları'),
  ]},
  { code: '58', name: 'Geçmiş Yıllar Zararları (-)', section: 'OZKAYNAKLAR', accounts: [
    a('580', 'Geçmiş Yıllar Zararları (-)', true),
  ]},
  { code: '59', name: 'Dönem Net Karı (Zararı)', section: 'OZKAYNAKLAR', accounts: [
    a('590', 'Dönem Net Karı'), a('591', 'Dönem Net Zararı (-)', true),
  ]},

  // ── GELİR TABLOSU ─────────────────────────────────────────────────────────
  { code: '60', name: 'Brüt Satışlar', section: 'GELIR_TABLOSU', accounts: [
    a('600', 'Yurtiçi Satışlar'), a('601', 'Yurtdışı Satışlar'), a('602', 'Diğer Gelirler'),
  ]},
  { code: '61', name: 'Satış İndirimleri (-)', section: 'GELIR_TABLOSU', accounts: [
    a('610', 'Satıştan İadeler (-)', true), a('611', 'Satış İskontoları (-)', true), a('612', 'Diğer İndirimler (-)', true),
  ]},
  { code: '62', name: 'Satışların Maliyeti (-)', section: 'GELIR_TABLOSU', accounts: [
    a('620', 'Satılan Mamuller Maliyeti (-)', true), a('621', 'Satılan Ticari Mallar Maliyeti (-)', true),
    a('622', 'Satılan Hizmet Maliyeti (-)', true), a('623', 'Diğer Satışların Maliyeti (-)', true),
  ]},
  { code: '63', name: 'Faaliyet Giderleri (-)', section: 'GELIR_TABLOSU', accounts: [
    a('630', 'Araştırma ve Geliştirme Giderleri (-)', true), a('631', 'Pazarlama, Satış ve Dağıtım Giderleri (-)', true),
    a('632', 'Genel Yönetim Giderleri (-)', true),
  ]},
  { code: '64', name: 'Diğer Faaliyetlerden Olağan Gelir ve Karlar', section: 'GELIR_TABLOSU', accounts: [
    a('640', 'İştiraklerden Temettü Gelirleri'), a('641', 'Bağlı Ortaklıklardan Temettü Gelirleri'),
    a('642', 'Faiz Gelirleri'), a('643', 'Komisyon Gelirleri'), a('644', 'Konusu Kalmayan Karşılıklar'),
    a('645', 'Menkul Kıymet Satış Karları'), a('646', 'Kambiyo Karları'), a('647', 'Reeskont Faiz Gelirleri'),
    a('648', 'Enflasyon Düzeltmesi Karları'), a('649', 'Diğer Olağan Gelir ve Karlar'),
  ]},
  { code: '65', name: 'Diğer Faaliyetlerden Olağan Gider ve Zararlar (-)', section: 'GELIR_TABLOSU', accounts: [
    a('653', 'Komisyon Giderleri (-)', true), a('654', 'Karşılık Giderleri (-)', true),
    a('655', 'Menkul Kıymet Satış Zararları (-)', true), a('656', 'Kambiyo Zararları (-)', true),
    a('657', 'Reeskont Faiz Giderleri (-)', true), a('658', 'Enflasyon Düzeltmesi Zararları (-)', true),
    a('659', 'Diğer Olağan Gider ve Zararlar (-)', true),
  ]},
  { code: '66', name: 'Finansman Giderleri (-)', section: 'GELIR_TABLOSU', accounts: [
    a('660', 'Kısa Vadeli Borçlanma Giderleri (-)', true), a('661', 'Uzun Vadeli Borçlanma Giderleri (-)', true),
  ]},
  { code: '67', name: 'Olağandışı Gelir ve Karlar', section: 'GELIR_TABLOSU', accounts: [
    a('671', 'Önceki Dönem Gelir ve Karları'), a('679', 'Diğer Olağandışı Gelir ve Karlar'),
  ]},
  { code: '68', name: 'Olağandışı Gider ve Zararlar (-)', section: 'GELIR_TABLOSU', accounts: [
    a('680', 'Çalışmayan Kısım Gider ve Zararları (-)', true), a('681', 'Önceki Dönem Gider ve Zararları (-)', true),
    a('689', 'Diğer Olağandışı Gider ve Zararlar (-)', true),
  ]},
  { code: '69', name: 'Dönem Net Karı (Zararı)', section: 'GELIR_TABLOSU', accounts: [
    a('690', 'Dönem Karı veya Zararı'),
    a('691', 'Dönem Karı Vergi ve Diğer Yasal Yükümlülük Karşılıkları (-)', true),
    a('692', 'Dönem Net Karı veya Zararı'),
  ]},
]

export const TDHP_ACCOUNT_BY_CODE: Record<string, TdhpAccount & { group: string; section: TdhpSection }> =
  Object.fromEntries(
    TDHP_GROUPS.flatMap(g => g.accounts.map(acc => [acc.code, { ...acc, group: g.code, section: g.section }])),
  )

export function tdhpAccountName(code: string): string {
  return TDHP_ACCOUNT_BY_CODE[code]?.name ?? ''
}
