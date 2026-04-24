# V3 Recovery Guide

## Altın Kopya Versiyonu

| Alan | Değer |
|------|-------|
| **Tag** | `v3-stable-20260424` |
| **Commit** | `6d6f607` |
| **Vercel Deploy** | `CZRYQjDWF` |
| **Tarih** | 24 Nisan 2026 |
| **Doğrulama** | DEKAM (entityId `24eacf7c-ed68-4ef9-82b0-7bbd58072b9d`) ile test edilmiş |

## Durum Özeti

- Rating C → B tutarlı (6 kademe iyileşme)
- 4 dengeli aksiyon: A05 (Alacak Tahsilat), A06 (Stok), A12 (Brüt Marj), A18 (Net Satış)
- TDHP muhasebe kayıtları doğru
- Chevron expand çalışıyor, crash yok
- Detay tab BORÇ/ALACAK dolu
- `customCheck` adapter aktif (A12, A18 gibi kaynak hesap gerektirmeyen aksiyonlar devreye giriyor)

## Geri Dönüş Yöntemleri

### Yöntem A — Git Tag Checkout (kalıcı geri dönüş)

```bash
git checkout v3-stable-20260424
git checkout -b recovery-from-stable
git push origin recovery-from-stable
```

Sonra Vercel'de bu branch'i production'a promote et.

### Yöntem B — Vercel Instant Rollback (en hızlı, ~30 saniye)

1. Vercel dashboard → Deployments
2. Deployment `CZRYQjDWF`'yi bul
3. Üç nokta menüsü → **"Promote to Production"**
4. ~30 saniye içinde canlı sistem bu versiyona döner

### Yöntem C — Son Commit'i Geri Al (tek değişiklik sorunluysa)

```bash
git revert HEAD
git push
```

Bu son commit'i geri alan yeni bir commit oluşturur, Vercel otomatik deploy eder.

## V3.1 Branch

V3.1 Distress Framework geliştirmesi ayrı branch'te yürütülür:

```bash
git checkout v3.1-distress-framework
```

Main branch her zaman çalışan production versiyonunu taşır.

## Kritik Fix Geçmişi (v3-stable-20260424'e kadar)

| Commit | Açıklama |
|--------|----------|
| `5064065` | ScenarioPanelV3 premium banker UI (3 tab) + feature flag `?v=v3` |
| `c00a5bd` | TDHP group-match + coverage-based DQ + accounting legs grouping |
| `e10a9f4` | currentRating source fix (finalRating önceliği) + amountFormatted |
| `c18366d` | toStringArray crash fix (whySelected/whyRejected/requiredActionNames) |
| `743f7b8` | consolidateByActionId — duplicate action parts merge + legs merge |
| `3225c39` | Rating source unification + detay tab legs render fix |
| `e8d3770` | A13 guardrail bug fix (770→630) + A01 threshold 5M→1M |
| `6d6f607` | **isActionApplicable fix — customCheck adapter + source balance guard** |
