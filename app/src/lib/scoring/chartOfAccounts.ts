/**
 * Finrate — Türk Tek Düzen Hesap Planı
 *
 * Tam hesap planı: dönen varlıklar, duran varlıklar,
 * kısa/uzun vadeli yabancı kaynaklar, özkaynaklar, gelir tablosu.
 */

export type AccountGroup =
  | 'HAZIR_DEGERLER' | 'MENKUL_KIYMETLER' | 'TICARI_ALACAKLAR'
  | 'DIGER_ALACAKLAR' | 'STOKLAR' | 'YYIAO_MALIYETI'
  | 'GELECEK_AYA_GIDER' | 'DIGER_DONEN'
  | 'TICARI_ALACAKLAR_UV' | 'MALI_DURAN' | 'MADDI_DURAN'
  | 'MADDI_OLMAYAN' | 'OZEL_TUKENME' | 'GELECEK_YIL_GIDER' | 'DIGER_DURAN'
  | 'MALI_BORCLAR_KV' | 'TICARI_BORCLAR_KV' | 'DIGER_BORCLAR_KV'
  | 'ALINAN_AVANSLAR_KV' | 'YYIAO_HAKEDIS' | 'ODENECEK_VERGI'
  | 'BORC_GIDER_KARS' | 'GELECEK_AYA_GELIR' | 'DIGER_KV'
  | 'MALI_BORCLAR_UV' | 'TICARI_BORCLAR_UV' | 'DIGER_BORCLAR_UV'
  | 'ALINAN_AVANSLAR_UV' | 'BORC_GIDER_KARS_UV' | 'GELECEK_YIL_GELIR' | 'DIGER_UV'
  | 'ODENMIS_SERMAYE' | 'SERMAYE_YEDEKLERI' | 'KAR_YEDEKLERI'
  | 'GECMIS_KAR_ZARAR' | 'DONEM_KAR_ZARAR'
  | 'BRUT_SATISLAR' | 'SATIS_INDIRIMLERI' | 'SMM'
  | 'FAALIYET_GIDERLERI' | 'DIGER_FAAL_GELIR' | 'DIGER_FAAL_GIDER'
  | 'FINANSMAN_GIDERI' | 'OLAGANDISI_GELIR' | 'OLAGANDISI_GIDER'
  | 'DONEM_KAR' | 'VERGI_KARS' | 'NET_KAR'

export interface Account {
  code:    string
  name:    string
  group:   AccountGroup
  side:    'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
  contra:  boolean  // eksi bakiyeli hesap mı
}

export const CHART_OF_ACCOUNTS: Record<string, Account> = {
  // ── DÖNEN VARLIKLAR ──────────────────────────────────────────────────────────

  // Hazır Değerler
  '100': { code: '100', name: 'Kasa',                                  group: 'HAZIR_DEGERLER', side: 'ASSET', contra: false },
  '101': { code: '101', name: 'Alınan Çekler',                         group: 'HAZIR_DEGERLER', side: 'ASSET', contra: false },
  '102': { code: '102', name: 'Bankalar',                              group: 'HAZIR_DEGERLER', side: 'ASSET', contra: false },
  '103': { code: '103', name: 'Verilen Çekler ve Ödeme Emirleri (-)',   group: 'HAZIR_DEGERLER', side: 'ASSET', contra: true  },
  '108': { code: '108', name: 'Diğer Hazır Değerler',                  group: 'HAZIR_DEGERLER', side: 'ASSET', contra: false },

  // Menkul Kıymetler
  '110': { code: '110', name: 'Hisse Senetleri',                                          group: 'MENKUL_KIYMETLER', side: 'ASSET', contra: false },
  '111': { code: '111', name: 'Özel Kesim Tahvil Senet ve Bonoları',                      group: 'MENKUL_KIYMETLER', side: 'ASSET', contra: false },
  '112': { code: '112', name: 'Kamu Kesimi Tahvil Senet ve Bonoları',                     group: 'MENKUL_KIYMETLER', side: 'ASSET', contra: false },
  '118': { code: '118', name: 'Diğer Menkul Kıymetler',                                  group: 'MENKUL_KIYMETLER', side: 'ASSET', contra: false },
  '119': { code: '119', name: 'Menkul Kıymetler Değer Düşüklüğü Karşılığı (-)',          group: 'MENKUL_KIYMETLER', side: 'ASSET', contra: true  },

  // Ticari Alacaklar (KV)
  '120': { code: '120', name: 'Alıcılar',                                                 group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: false },
  '121': { code: '121', name: 'Alacak Senetleri',                                         group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: false },
  '122': { code: '122', name: 'Alacak Senetleri Reeskontu (-)',                            group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: true  },
  '126': { code: '126', name: 'Verilen Depozito ve Teminatlar',                            group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: false },
  '127': { code: '127', name: 'Diğer Ticari Alacaklar',                                   group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: false },
  '128': { code: '128', name: 'Şüpheli Ticari Alacaklar',                                 group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: false },
  '129': { code: '129', name: 'Şüpheli Ticari Alacaklar Karşılığı (-)',                   group: 'TICARI_ALACAKLAR', side: 'ASSET', contra: true  },

  // Diğer Alacaklar (KV)
  '131': { code: '131', name: 'Ortaklardan Alacaklar',                                    group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '132': { code: '132', name: 'İştiraklerden Alacaklar',                                  group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '133': { code: '133', name: 'Bağlı Ortaklıklardan Alacaklar',                           group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '135': { code: '135', name: 'Personelden Alacaklar',                                    group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '136': { code: '136', name: 'Diğer Çeşitli Alacaklar',                                  group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '137': { code: '137', name: 'Diğer Alacak Senetleri Reeskontu (-)',                     group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: true  },
  '138': { code: '138', name: 'Şüpheli Diğer Alacaklar',                                  group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: false },
  '139': { code: '139', name: 'Şüpheli Diğer Alacaklar Karşılığı (-)',                    group: 'DIGER_ALACAKLAR', side: 'ASSET', contra: true  },

  // Stoklar
  '150': { code: '150', name: 'İlk Madde ve Malzeme',                                     group: 'STOKLAR', side: 'ASSET', contra: false },
  '151': { code: '151', name: 'Yarı Mamuller',                                            group: 'STOKLAR', side: 'ASSET', contra: false },
  '152': { code: '152', name: 'Mamuller',                                                 group: 'STOKLAR', side: 'ASSET', contra: false },
  '153': { code: '153', name: 'Ticari Mallar',                                            group: 'STOKLAR', side: 'ASSET', contra: false },
  '157': { code: '157', name: 'Diğer Stoklar',                                            group: 'STOKLAR', side: 'ASSET', contra: false },
  '158': { code: '158', name: 'Stok Değer Düşüklüğü Karşılığı (-)',                       group: 'STOKLAR', side: 'ASSET', contra: true  },
  '159': { code: '159', name: 'Verilen Sipariş Avansları',                                group: 'STOKLAR', side: 'ASSET', contra: false },

  // Yıllara Yaygın İnşaat ve Onarım Maliyetleri
  '170': { code: '170', name: 'Yıllara Yaygın İnşaat ve Onarım Maliyetleri',             group: 'YYIAO_MALIYETI', side: 'ASSET', contra: false },
  '178': { code: '178', name: 'Yıllara Yaygın İnşaat Enflasyon Düzeltme Hesabı',         group: 'YYIAO_MALIYETI', side: 'ASSET', contra: false },

  // Gelecek Aylara Ait Giderler ve Gelir Tahakkukları
  '180': { code: '180', name: 'Gelecek Aylara Ait Giderler',                              group: 'GELECEK_AYA_GIDER', side: 'ASSET', contra: false },
  '181': { code: '181', name: 'Gelir Tahakkukları',                                       group: 'GELECEK_AYA_GIDER', side: 'ASSET', contra: false },

  // Diğer Dönen Varlıklar
  '190': { code: '190', name: 'Devreden KDV',                                             group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '191': { code: '191', name: 'İndirilecek KDV',                                          group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '193': { code: '193', name: 'Peşin Ödenen Vergiler ve Fonlar',                          group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '195': { code: '195', name: 'İş Avansları',                                             group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '196': { code: '196', name: 'Personel Avansları',                                       group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '197': { code: '197', name: 'Sayım ve Tesellüm Noksanları',                             group: 'DIGER_DONEN', side: 'ASSET', contra: false },
  '198': { code: '198', name: 'Diğer Çeşitli Dönen Varlıklar',                           group: 'DIGER_DONEN', side: 'ASSET', contra: false },

  // ── DURAN VARLIKLAR ──────────────────────────────────────────────────────────

  // Ticari Alacaklar (UV)
  '220': { code: '220', name: 'Alıcılar (UV)',                                            group: 'TICARI_ALACAKLAR_UV', side: 'ASSET', contra: false },
  '221': { code: '221', name: 'Alacak Senetleri (UV)',                                   group: 'TICARI_ALACAKLAR_UV', side: 'ASSET', contra: false },
  '226': { code: '226', name: 'Verilen Depozito ve Teminatlar (UV)',                     group: 'TICARI_ALACAKLAR_UV', side: 'ASSET', contra: false },

  // Mali Duran Varlıklar
  '240': { code: '240', name: 'Bağlı Menkul Kıymetler',                                  group: 'MALI_DURAN', side: 'ASSET', contra: false },
  '242': { code: '242', name: 'İştirakler',                                               group: 'MALI_DURAN', side: 'ASSET', contra: false },
  '245': { code: '245', name: 'Bağlı Ortaklıklar',                                       group: 'MALI_DURAN', side: 'ASSET', contra: false },

  // Maddi Duran Varlıklar
  '250': { code: '250', name: 'Arazi ve Arsalar',                                         group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '251': { code: '251', name: 'Yeraltı ve Yerüstü Düzenleri',                            group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '252': { code: '252', name: 'Binalar',                                                  group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '253': { code: '253', name: 'Tesis Makine ve Cihazlar',                                group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '254': { code: '254', name: 'Taşıtlar',                                                group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '255': { code: '255', name: 'Demirbaşlar',                                             group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '256': { code: '256', name: 'Diğer Maddi Duran Varlıklar',                             group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '257': { code: '257', name: 'Birikmiş Amortismanlar (-)',                              group: 'MADDI_DURAN', side: 'ASSET', contra: true  },
  '258': { code: '258', name: 'Yapılmakta Olan Yatırımlar',                              group: 'MADDI_DURAN', side: 'ASSET', contra: false },
  '259': { code: '259', name: 'Verilen Avanslar',                                        group: 'MADDI_DURAN', side: 'ASSET', contra: false },

  // Maddi Olmayan Duran Varlıklar
  '260': { code: '260', name: 'Haklar',                                                   group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '261': { code: '261', name: 'Şerefiye',                                                group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '262': { code: '262', name: 'Kuruluş ve Örgütlenme Giderleri',                         group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '263': { code: '263', name: 'Araştırma ve Geliştirme Giderleri',                       group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '264': { code: '264', name: 'Özel Maliyetler',                                         group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '267': { code: '267', name: 'Diğer Maddi Olmayan Duran Varlıklar',                     group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },
  '268': { code: '268', name: 'Birikmiş Amortismanlar (-)',                              group: 'MADDI_OLMAYAN', side: 'ASSET', contra: true  },
  '269': { code: '269', name: 'Verilen Avanslar',                                        group: 'MADDI_OLMAYAN', side: 'ASSET', contra: false },

  // Gelecek Yıllara Ait Giderler
  '280': { code: '280', name: 'Gelecek Yıllara Ait Giderler',                            group: 'GELECEK_YIL_GIDER', side: 'ASSET', contra: false },
  '281': { code: '281', name: 'Gelir Tahakkukları (UV)',                                 group: 'GELECEK_YIL_GIDER', side: 'ASSET', contra: false },

  // Diğer Duran Varlıklar
  '294': { code: '294', name: 'Elden Çıkarılacak Stoklar ve Maddi Duran Varlıklar',     group: 'DIGER_DURAN', side: 'ASSET', contra: false },
  '295': { code: '295', name: 'Peşin Ödenen Vergiler ve Fonlar (UV)',                   group: 'DIGER_DURAN', side: 'ASSET', contra: false },

  // ── KISA VADELİ YABANCI KAYNAKLAR ────────────────────────────────────────────

  // Mali Borçlar (KV)
  '300': { code: '300', name: 'Banka Kredileri',                                                             group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '301': { code: '301', name: 'Finansal Kiralama İşlemlerinden Borçlar',                                    group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '302': { code: '302', name: 'Ertelenmiş Finansal Kiralama Borçlanma Maliyetleri (-)',                     group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: true  },
  '303': { code: '303', name: 'Uzun Vadeli Kredilerin Anapara Taksitleri ve Faizleri',                      group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '304': { code: '304', name: 'Tahvil Anapara Borç Taksit ve Faizleri',                                    group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '305': { code: '305', name: 'Çıkarılmış Bonolar ve Senetler',                                            group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '306': { code: '306', name: 'Çıkarılmış Diğer Menkul Kıymetler',                                        group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '308': { code: '308', name: 'Menkul Kıymetler İhraç Farkı (-)',                                         group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: true  },
  '309': { code: '309', name: 'Diğer Mali Borçlar',                                                        group: 'MALI_BORCLAR_KV', side: 'LIABILITY', contra: false },

  // Ticari Borçlar (KV)
  '320': { code: '320', name: 'Satıcılar',                                                                  group: 'TICARI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '321': { code: '321', name: 'Borç Senetleri',                                                            group: 'TICARI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '322': { code: '322', name: 'Borç Senetleri Reeskontu (-)',                                              group: 'TICARI_BORCLAR_KV', side: 'LIABILITY', contra: true  },
  '326': { code: '326', name: 'Alınan Depozito ve Teminatlar',                                             group: 'TICARI_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '329': { code: '329', name: 'Diğer Ticari Borçlar',                                                     group: 'TICARI_BORCLAR_KV', side: 'LIABILITY', contra: false },

  // Diğer Borçlar (KV)
  '331': { code: '331', name: 'Ortaklara Borçlar',                                                         group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '332': { code: '332', name: 'İştiraklere Borçlar',                                                       group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '333': { code: '333', name: 'Bağlı Ortaklıklara Borçlar',                                               group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '335': { code: '335', name: 'Personele Borçlar',                                                         group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '336': { code: '336', name: 'Diğer Çeşitli Borçlar',                                                    group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: false },
  '337': { code: '337', name: 'Diğer Borç Senetleri Reeskontu (-)',                                       group: 'DIGER_BORCLAR_KV', side: 'LIABILITY', contra: true  },

  // Alınan Avanslar (KV)
  '340': { code: '340', name: 'Alınan Sipariş Avansları',                                                  group: 'ALINAN_AVANSLAR_KV', side: 'LIABILITY', contra: false },
  '349': { code: '349', name: 'Alınan Diğer Avanslar',                                                    group: 'ALINAN_AVANSLAR_KV', side: 'LIABILITY', contra: false },

  // Yıllara Yaygın İnşaat Hakediş Bedelleri
  '350': { code: '350', name: 'Yıllara Yaygın İnşaat ve Onarım Hakedişleri',                              group: 'YYIAO_HAKEDIS', side: 'LIABILITY', contra: false },
  '358': { code: '358', name: 'Yıllara Yaygın İnşaat Enflasyon Düzeltme Hesabı',                         group: 'YYIAO_HAKEDIS', side: 'LIABILITY', contra: false },

  // Ödenecek Vergi ve Diğer Yükümlülükler
  '360': { code: '360', name: 'Ödenecek Vergi ve Fonlar',                                                  group: 'ODENECEK_VERGI', side: 'LIABILITY', contra: false },
  '361': { code: '361', name: 'Ödenecek Sosyal Güvenlik Kesintileri',                                     group: 'ODENECEK_VERGI', side: 'LIABILITY', contra: false },
  '368': { code: '368', name: 'Vadesi Geçmiş Ertelenmiş veya Taksitlendirilmiş Vergi ve Diğer Yükümlülükler', group: 'ODENECEK_VERGI', side: 'LIABILITY', contra: false },
  '369': { code: '369', name: 'Ödenecek Diğer Yükümlülükler',                                            group: 'ODENECEK_VERGI', side: 'LIABILITY', contra: false },

  // Borç ve Gider Karşılıkları (KV)
  '370': { code: '370', name: 'Dönem Kârı Vergi ve Diğer Yasal Yükümlülük Karşılıkları',                 group: 'BORC_GIDER_KARS', side: 'LIABILITY', contra: false },
  '371': { code: '371', name: 'Dönem Kârının Peşin Ödenen Vergi ve Diğer Yükümlülükleri (-)',            group: 'BORC_GIDER_KARS', side: 'LIABILITY', contra: true  },
  '372': { code: '372', name: 'Kıdem Tazminatı Karşılığı',                                               group: 'BORC_GIDER_KARS', side: 'LIABILITY', contra: false },
  '373': { code: '373', name: 'Maliyet Giderleri Karşılığı',                                             group: 'BORC_GIDER_KARS', side: 'LIABILITY', contra: false },
  '379': { code: '379', name: 'Diğer Borç ve Gider Karşılıkları',                                        group: 'BORC_GIDER_KARS', side: 'LIABILITY', contra: false },

  // Gelecek Aylara Ait Gelirler
  '380': { code: '380', name: 'Gelecek Aylara Ait Gelirler',                                              group: 'GELECEK_AYA_GELIR', side: 'LIABILITY', contra: false },
  '381': { code: '381', name: 'Gider Tahakkukları',                                                       group: 'GELECEK_AYA_GELIR', side: 'LIABILITY', contra: false },

  // Diğer KV Yabancı Kaynaklar
  '391': { code: '391', name: 'Hesaplanan KDV',                                                           group: 'DIGER_KV', side: 'LIABILITY', contra: false },
  '392': { code: '392', name: 'Diğer KDV',                                                               group: 'DIGER_KV', side: 'LIABILITY', contra: false },
  '393': { code: '393', name: 'Merkez ve Şubeler Cari Hesabı',                                           group: 'DIGER_KV', side: 'LIABILITY', contra: false },
  '397': { code: '397', name: 'Sayım ve Tesellüm Fazlaları',                                             group: 'DIGER_KV', side: 'LIABILITY', contra: false },
  '399': { code: '399', name: 'Diğer Çeşitli Yabancı Kaynaklar',                                        group: 'DIGER_KV', side: 'LIABILITY', contra: false },

  // ── UZUN VADELİ YABANCI KAYNAKLAR ────────────────────────────────────────────

  // Mali Borçlar (UV)
  '400': { code: '400', name: 'Banka Kredileri (UV)',                                                      group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '401': { code: '401', name: 'Finansal Kiralama İşlemlerinden Borçlar (UV)',                              group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '402': { code: '402', name: 'Ertelenmiş Finansal Kiralama Borçlanma Maliyetleri (-)',                   group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: true  },
  '405': { code: '405', name: 'Çıkarılmış Tahviller',                                                    group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '407': { code: '407', name: 'Çıkarılmış Diğer Menkul Kıymetler',                                      group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '408': { code: '408', name: 'Menkul Kıymetler İhraç Farkı (-)',                                       group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: true  },
  '409': { code: '409', name: 'Diğer Mali Borçlar',                                                      group: 'MALI_BORCLAR_UV', side: 'LIABILITY', contra: false },

  // Ticari Borçlar (UV)
  '420': { code: '420', name: 'Satıcılar (UV)',                                                           group: 'TICARI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '421': { code: '421', name: 'Borç Senetleri (UV)',                                                     group: 'TICARI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '422': { code: '422', name: 'Borç Senetleri Reeskontu (-)',                                            group: 'TICARI_BORCLAR_UV', side: 'LIABILITY', contra: true  },
  '426': { code: '426', name: 'Alınan Depozito ve Teminatlar (UV)',                                      group: 'TICARI_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '429': { code: '429', name: 'Diğer Ticari Borçlar (UV)',                                               group: 'TICARI_BORCLAR_UV', side: 'LIABILITY', contra: false },

  // Diğer Borçlar (UV)
  '431': { code: '431', name: 'Ortaklara Borçlar (UV)',                                                   group: 'DIGER_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '432': { code: '432', name: 'İştiraklere Borçlar (UV)',                                                 group: 'DIGER_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '433': { code: '433', name: 'Bağlı Ortaklıklara Borçlar (UV)',                                         group: 'DIGER_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '436': { code: '436', name: 'Diğer Çeşitli Borçlar (UV)',                                              group: 'DIGER_BORCLAR_UV', side: 'LIABILITY', contra: false },
  '437': { code: '437', name: 'Diğer Borç Senetleri Reeskontu (-)',                                     group: 'DIGER_BORCLAR_UV', side: 'LIABILITY', contra: true  },

  // Alınan Avanslar (UV)
  '440': { code: '440', name: 'Alınan Sipariş Avansları (UV)',                                           group: 'ALINAN_AVANSLAR_UV', side: 'LIABILITY', contra: false },
  '449': { code: '449', name: 'Alınan Diğer Avanslar (UV)',                                              group: 'ALINAN_AVANSLAR_UV', side: 'LIABILITY', contra: false },

  // Borç ve Gider Karşılıkları (UV)
  '472': { code: '472', name: 'Kıdem Tazminatı Karşılığı',                                              group: 'BORC_GIDER_KARS_UV', side: 'LIABILITY', contra: false },
  '479': { code: '479', name: 'Diğer Borç ve Gider Karşılıkları',                                       group: 'BORC_GIDER_KARS_UV', side: 'LIABILITY', contra: false },

  // Gelecek Yıllara Ait Gelirler (UV)
  '480': { code: '480', name: 'Gelecek Yıllara Ait Gelirler',                                           group: 'GELECEK_YIL_GELIR', side: 'LIABILITY', contra: false },
  '481': { code: '481', name: 'Gider Tahakkukları (UV)',                                                 group: 'GELECEK_YIL_GELIR', side: 'LIABILITY', contra: false },

  // Diğer UV Yabancı Kaynaklar
  '492': { code: '492', name: 'Gelecek Yıllara Ertelenen veya Terkin Edilen KDV',                       group: 'DIGER_UV', side: 'LIABILITY', contra: false },

  // ── ÖZKAYNAKLAR ──────────────────────────────────────────────────────────────

  // Ödenmiş Sermaye
  '500': { code: '500', name: 'Sermaye',                                                                  group: 'ODENMIS_SERMAYE', side: 'EQUITY', contra: false },
  '501': { code: '501', name: 'Ödenmemiş Sermaye (-)',                                                   group: 'ODENMIS_SERMAYE', side: 'EQUITY', contra: true  },
  '502': { code: '502', name: 'Sermaye Düzeltmesi Olumlu Farkları',                                      group: 'ODENMIS_SERMAYE', side: 'EQUITY', contra: false },
  '503': { code: '503', name: 'Sermaye Düzeltmesi Olumsuz Farkları (-)',                                 group: 'ODENMIS_SERMAYE', side: 'EQUITY', contra: true  },

  // Sermaye Yedekleri
  '520': { code: '520', name: 'Hisse Senedi İhraç Primleri',                                             group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },
  '521': { code: '521', name: 'Hisse Senedi İptal Kârları',                                             group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },
  '522': { code: '522', name: 'Maddi Duran Varlık Yeniden Değerleme Artışları',                         group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },
  '523': { code: '523', name: 'İştirakler Yeniden Değerleme Artışları',                                 group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },
  '524': { code: '524', name: 'Maliyet Artışları Fonu',                                                 group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },
  '529': { code: '529', name: 'Diğer Sermaye Yedekleri',                                                group: 'SERMAYE_YEDEKLERI', side: 'EQUITY', contra: false },

  // Kâr Yedekleri
  '540': { code: '540', name: 'Yasal Yedekler',                                                          group: 'KAR_YEDEKLERI', side: 'EQUITY', contra: false },
  '541': { code: '541', name: 'Statü Yedekleri',                                                        group: 'KAR_YEDEKLERI', side: 'EQUITY', contra: false },
  '542': { code: '542', name: 'Olağanüstü Yedekler',                                                    group: 'KAR_YEDEKLERI', side: 'EQUITY', contra: false },
  '548': { code: '548', name: 'Diğer Kâr Yedekleri',                                                   group: 'KAR_YEDEKLERI', side: 'EQUITY', contra: false },
  '549': { code: '549', name: 'Özel Fonlar',                                                            group: 'KAR_YEDEKLERI', side: 'EQUITY', contra: false },

  // Geçmiş Yıllar Kâr/Zararları
  '570': { code: '570', name: 'Geçmiş Yıl Kârları',                                                     group: 'GECMIS_KAR_ZARAR', side: 'EQUITY', contra: false },
  '580': { code: '580', name: 'Geçmiş Yıl Zararları (-)',                                               group: 'GECMIS_KAR_ZARAR', side: 'EQUITY', contra: true  },

  // Dönem Net Kâr/Zararı
  '590': { code: '590', name: 'Dönem Net Kârı',                                                         group: 'DONEM_KAR_ZARAR', side: 'EQUITY', contra: false },
  '591': { code: '591', name: 'Dönem Net Zararı (-)',                                                   group: 'DONEM_KAR_ZARAR', side: 'EQUITY', contra: true  },

  // ── GELİR TABLOSU ────────────────────────────────────────────────────────────

  // Brüt Satışlar
  '600': { code: '600', name: 'Yurtiçi Satışlar',                                                       group: 'BRUT_SATISLAR', side: 'INCOME', contra: false },
  '601': { code: '601', name: 'Yurtdışı Satışlar',                                                      group: 'BRUT_SATISLAR', side: 'INCOME', contra: false },
  '602': { code: '602', name: 'Diğer Gelirler',                                                         group: 'BRUT_SATISLAR', side: 'INCOME', contra: false },

  // Satış İndirimleri (-)
  '610': { code: '610', name: 'Satıştan İadeler (-)',                                                   group: 'SATIS_INDIRIMLERI', side: 'INCOME', contra: true  },
  '611': { code: '611', name: 'Satış İskontoları (-)',                                                  group: 'SATIS_INDIRIMLERI', side: 'INCOME', contra: true  },
  '612': { code: '612', name: 'Diğer İndirimler (-)',                                                   group: 'SATIS_INDIRIMLERI', side: 'INCOME', contra: true  },

  // Satışların Maliyeti
  '620': { code: '620', name: 'Satılan Mamuller Maliyeti (-)',                                          group: 'SMM', side: 'EXPENSE', contra: false },
  '621': { code: '621', name: 'Satılan Ticari Mallar Maliyeti (-)',                                     group: 'SMM', side: 'EXPENSE', contra: false },
  '622': { code: '622', name: 'Satılan Hizmet Maliyeti (-)',                                            group: 'SMM', side: 'EXPENSE', contra: false },
  '623': { code: '623', name: 'Diğer Satışların Maliyeti (-)',                                         group: 'SMM', side: 'EXPENSE', contra: false },

  // Faaliyet Giderleri
  '630': { code: '630', name: 'Araştırma ve Geliştirme Giderleri (-)',                                  group: 'FAALIYET_GIDERLERI', side: 'EXPENSE', contra: false },
  '631': { code: '631', name: 'Pazarlama Satış ve Dağıtım Giderleri (-)',                              group: 'FAALIYET_GIDERLERI', side: 'EXPENSE', contra: false },
  '632': { code: '632', name: 'Genel Yönetim Giderleri (-)',                                           group: 'FAALIYET_GIDERLERI', side: 'EXPENSE', contra: false },

  // Diğer Faaliyet Gelirleri
  '640': { code: '640', name: 'İştiraklerden Temettü Gelirleri',                                        group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '641': { code: '641', name: 'Bağlı Ortaklıklardan Temettü Gelirleri',                                group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '642': { code: '642', name: 'Faiz Gelirleri',                                                        group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '643': { code: '643', name: 'Komisyon Gelirleri',                                                    group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '644': { code: '644', name: 'Konusu Kalmayan Karşılıklar',                                           group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '645': { code: '645', name: 'Menkul Kıymet Satış Kârları',                                          group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '646': { code: '646', name: 'Kambiyo Kârları',                                                       group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '647': { code: '647', name: 'Reeskont Faiz Gelirleri',                                               group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '648': { code: '648', name: 'Enflasyon Düzeltme Kârları',                                            group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },
  '649': { code: '649', name: 'Diğer Olağan Gelir ve Kârlar',                                         group: 'DIGER_FAAL_GELIR', side: 'INCOME', contra: false },

  // Diğer Faaliyet Giderleri
  '653': { code: '653', name: 'Komisyon Giderleri (-)',                                                  group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '654': { code: '654', name: 'Karşılık Giderleri (-)',                                                 group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '655': { code: '655', name: 'Menkul Kıymet Satış Zararları (-)',                                     group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '656': { code: '656', name: 'Kambiyo Zararları (-)',                                                  group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '657': { code: '657', name: 'Reeskont Faiz Giderleri (-)',                                            group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '658': { code: '658', name: 'Enflasyon Düzeltme Zararları (-)',                                       group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },
  '659': { code: '659', name: 'Diğer Olağan Gider ve Zararlar (-)',                                    group: 'DIGER_FAAL_GIDER', side: 'EXPENSE', contra: false },

  // Finansman Giderleri
  '660': { code: '660', name: 'Kısa Vadeli Borçlanma Giderleri (-)',                                   group: 'FINANSMAN_GIDERI', side: 'EXPENSE', contra: false },
  '661': { code: '661', name: 'Uzun Vadeli Borçlanma Giderleri (-)',                                   group: 'FINANSMAN_GIDERI', side: 'EXPENSE', contra: false },

  // Olağandışı Gelir ve Kârlar
  '671': { code: '671', name: 'Önceki Dönem Gelir ve Kârları',                                         group: 'OLAGANDISI_GELIR', side: 'INCOME', contra: false },
  '679': { code: '679', name: 'Diğer Olağandışı Gelir ve Kârlar',                                     group: 'OLAGANDISI_GELIR', side: 'INCOME', contra: false },

  // Olağandışı Gider ve Zararlar
  '680': { code: '680', name: 'Çalışmayan Kısım Gider ve Zararları (-)',                               group: 'OLAGANDISI_GIDER', side: 'EXPENSE', contra: false },
  '681': { code: '681', name: 'Önceki Dönem Gider ve Zararları (-)',                                   group: 'OLAGANDISI_GIDER', side: 'EXPENSE', contra: false },
  '689': { code: '689', name: 'Diğer Olağandışı Gider ve Zararlar (-)',                                group: 'OLAGANDISI_GIDER', side: 'EXPENSE', contra: false },

  // Dönem Kârı / Net Kâr
  '690': { code: '690', name: 'Dönem Kârı veya Zararı',                                                group: 'DONEM_KAR',  side: 'INCOME',  contra: false },
  '691': { code: '691', name: 'Dönem Kârı Vergi ve Diğer Yasal Yükümlülük Karşılıkları (-)',          group: 'VERGI_KARS', side: 'EXPENSE', contra: false },
  '692': { code: '692', name: 'Dönem Net Kârı veya Zararı',                                            group: 'NET_KAR',    side: 'INCOME',  contra: false },
  '697': { code: '697', name: 'Yıllara Yaygın İnşaat Enflasyon Düzeltme Hesabı',                      group: 'NET_KAR',    side: 'INCOME',  contra: false },
}

// ─── YARDIMCI FONKSİYONLAR ───────────────────────────────────────────────────

export function getAccount(code: string): Account | undefined {
  return CHART_OF_ACCOUNTS[code]
}

export function getAccountsByGroup(group: AccountGroup): Account[] {
  return Object.values(CHART_OF_ACCOUNTS).filter(a => a.group === group)
}

export function getAccountsBySide(side: Account['side']): Account[] {
  return Object.values(CHART_OF_ACCOUNTS).filter(a => a.side === side)
}
