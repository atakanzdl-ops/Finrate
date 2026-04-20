'use client'

import React from 'react'

const C = {
  card: 'rgba(255,255,255,0.72)',
  cardBorder: 'rgba(180,210,235,0.45)',
  label: '#7a9ab8',
  value: '#0f2137',
  grid: 'rgba(0,49,83,0.07)',
  sep: 'rgba(0,49,83,0.09)',
  track: 'rgba(0,49,83,0.1)',
  teal: '#10c9b0',
  tealBg: 'rgba(16,201,176,0.12)',
  red: '#f05070',
  redBg: 'rgba(240,80,112,0.12)',
}

export default function HeroSection() {
  return (
    <div className="crystal-nexus-shell">
      <section className="hero">
        <div className="hero-grid">

          {/* ── Sol: Metin ── */}
          <div className="left-content">
            <h1 className="headline-crystal">
              Finansal<br />
              gücünüzü<br />
              veriye dökün
            </h1>
            <p className="description-crystal">
              Kurumsal finansal analiz ve kredi derecelendirme platformu.
              Şirketinizin finansal sağlığını anında görün ve bankaların baktığı gibi bakın.
            </p>
            <button className="btn-main-stark">Ücretsiz Başla</button>
          </div>

          {/* ── Sağ: Şirket Skor Kartı ── */}
          <div className="scorecard-wrapper">
            <div className="card-perspective-wrapper">
              <div style={{
                background: 'rgba(235,245,255,0.90)',
                backdropFilter: 'blur(28px) saturate(200%)',
                WebkitBackdropFilter: 'blur(28px) saturate(200%)',
                border: '1px solid rgba(255,255,255,0.95)',
                borderRadius: 20,
                padding: 14,
                width: 490,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>

                {/* ── Üst 4 Metrik Kart ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>

                  {/* Finrate Skoru */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ fontSize: '0.42rem', fontWeight: 700, color: C.label, letterSpacing: '0.06em', marginBottom: 7 }}>FINRATE SKORU</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="42" height="42" viewBox="0 0 42 42" style={{ flexShrink: 0 }}>
                        <circle cx="21" cy="21" r="16" fill="none" stroke={C.track} strokeWidth="5"/>
                        <circle cx="21" cy="21" r="16" fill="none" stroke={C.teal} strokeWidth="5"
                          strokeDasharray={`${2 * Math.PI * 16 * 0.742} ${2 * Math.PI * 16 * 0.258}`}
                          strokeLinecap="round"
                          transform="rotate(-90 21 21)"/>
                        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" fill={C.value} fontSize="7.5" fontWeight="800">742</text>
                      </svg>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: C.teal, lineHeight: 1 }}>AA+</div>
                        <div style={{ fontSize: '0.38rem', color: C.label, marginTop: 2, lineHeight: 1.3 }}>Yüksek Kredi Notu</div>
                        <div style={{ marginTop: 4, fontSize: '0.38rem', fontWeight: 700, color: C.teal, background: C.tealBg, padding: '2px 5px', borderRadius: 4, display: 'inline-block' }}>+12 puan</div>
                      </div>
                    </div>
                  </div>

                  {/* Aktif Toplam */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.label, letterSpacing: '0.06em' }}>AKTİF TOPLAM</span>
                      <span style={{ fontSize: '0.38rem', fontWeight: 700, color: C.teal, background: C.tealBg, padding: '1px 4px', borderRadius: 4 }}>+18.2%</span>
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: C.value, lineHeight: 1.1, marginBottom: 5 }}>₺14.8M</div>
                    <svg width="100%" height="22" viewBox="0 0 80 22" preserveAspectRatio="none">
                      <path d="M2,20 C15,17 25,13 40,9 C55,5 65,6 78,2"
                        fill="none" stroke={C.teal} strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    <div style={{ fontSize: '0.37rem', color: C.label, marginTop: 3 }}>Önceki dönem: ₺12.5M</div>
                  </div>

                  {/* Cari Oran */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.label, letterSpacing: '0.06em' }}>CARİ ORAN</span>
                      <span style={{ fontSize: '0.38rem', fontWeight: 700, color: C.teal, background: C.tealBg, padding: '1px 4px', borderRadius: 4 }}>+0.3</span>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: C.value, lineHeight: 1.1, marginBottom: 7 }}>1.85</div>
                    <div style={{ position: 'relative', height: 5, background: C.track, borderRadius: 3, marginBottom: 3 }}>
                      <div style={{ position: 'absolute', left: 0, width: '61%', height: '100%', background: `linear-gradient(90deg,${C.teal},#0ea5e9)`, borderRadius: 3 }}/>
                      <div style={{ position: 'absolute', left: 'calc(61% - 1px)', top: -3, width: 2, height: 11, background: C.value, borderRadius: 1, opacity: 0.4 }}/>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.32rem', color: C.label, marginBottom: 3 }}>
                      <span>Düşük</span><span>Hedef</span><span>Yüksek</span>
                    </div>
                    <div style={{ fontSize: '0.37rem', color: C.label }}>Sektör ort: 1.42</div>
                  </div>

                  {/* Borç / Özkaynak */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 9px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.4rem', fontWeight: 700, color: C.label, letterSpacing: '0.04em' }}>BORÇ/ÖZKAYNAK</span>
                      <span style={{ fontSize: '0.38rem', fontWeight: 700, color: C.red, background: C.redBg, padding: '1px 4px', borderRadius: 4 }}>-0.15</span>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: C.value, lineHeight: 1.1, marginBottom: 5 }}>0.62</div>
                    <svg width="100%" height="22" viewBox="0 0 80 22" preserveAspectRatio="none">
                      <path d="M2,5 C10,7 22,10 35,14 C48,18 60,17 75,20"
                        fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    <div style={{ fontSize: '0.37rem', color: C.label, marginTop: 3 }}>Sektör ort: 0.95</div>
                  </div>
                </div>

                {/* ── Alt 2 Kart ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 8 }}>

                  {/* Gelir & Performans Analizi */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, color: C.value, marginBottom: 1 }}>Gelir & Performans Analizi</div>
                    <div style={{ fontSize: '0.38rem', color: C.label, marginBottom: 8 }}>4 Dönemlik mukayeseli trend</div>
                    <svg width="100%" height="76" viewBox="0 0 248 76" preserveAspectRatio="none">
                      {[0, 25.3, 50.6, 76].map((y, i) => (
                        <line key={i} x1="0" y1={y} x2="248" y2={y} stroke={C.grid} strokeWidth="0.5"/>
                      ))}
                      <text x="0" y="6" fill={C.label} fontSize="5">₺15M</text>
                      <text x="0" y="30" fill={C.label} fontSize="5">₺12M</text>
                      <text x="0" y="56" fill={C.label} fontSize="5">₺9M</text>
                      <rect x="28"  y="62" width="14" height="14" rx="2.5" fill="#003153" opacity="0.75"/>
                      <rect x="44"  y="55" width="14" height="21" rx="2.5" fill={C.teal} opacity="0.35"/>
                      <rect x="88"  y="46" width="14" height="30" rx="2.5" fill="#003153" opacity="0.75"/>
                      <rect x="104" y="38" width="14" height="38" rx="2.5" fill={C.teal} opacity="0.35"/>
                      <rect x="148" y="32" width="14" height="44" rx="2.5" fill="#003153" opacity="0.75"/>
                      <rect x="164" y="22" width="14" height="54" rx="2.5" fill={C.teal} opacity="0.35"/>
                      <rect x="208" y="14" width="14" height="62" rx="2.5" fill="#003153" opacity="0.75"/>
                      <rect x="224" y="6"  width="14" height="70" rx="2.5" fill={C.teal} opacity="0.35"/>
                      <path d="M35,68 C70,58 105,50 119,42 C148,32 172,24 215,14"
                        fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="215" cy="14" r="3" fill={C.teal}/>
                      <circle cx="215" cy="14" r="6" fill={C.teal} opacity="0.2"/>
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-around', paddingLeft: 24, marginTop: 4 }}>
                      {['2022','2023','2024','2025'].map(y => (
                        <span key={y} style={{ fontSize: '0.38rem', color: C.label }}>{y}</span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: '#003153', opacity: 0.75 }}/>
                        <span style={{ fontSize: '0.37rem', color: C.label }}>Gelir</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: C.teal, opacity: 0.4 }}/>
                        <span style={{ fontSize: '0.37rem', color: C.label }}>EBITDA</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 16, height: 2, background: C.teal, borderRadius: 1 }}/>
                        <span style={{ fontSize: '0.37rem', color: C.label }}>Trend</span>
                      </div>
                    </div>
                  </div>

                  {/* Kredi Derecelendirme */}
                  <div style={{ background: C.card, borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.cardBorder}`, boxShadow: '0 2px 8px rgba(0,49,83,0.06)' }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, color: C.value, marginBottom: 10 }}>Kredi Derecelendirme</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
                      {['AAA','AA+','A','BBB','BB','B','CCC'].map(r => (
                        <div key={r} style={{
                          fontSize: '0.38rem', fontWeight: 700, padding: '3px 5px', borderRadius: 5,
                          background: r === 'AA+' ? `linear-gradient(135deg,${C.teal},#0ea5e9)` : 'rgba(0,49,83,0.06)',
                          color: r === 'AA+' ? 'white' : C.label,
                          border: r === 'AA+' ? 'none' : `1px solid ${C.cardBorder}`,
                        }}>
                          {r}
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: C.sep, marginBottom: 8 }}/>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.42rem', color: C.label }}>Risk Seviyesi</span>
                        <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.teal }}>Düşük</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.42rem', color: C.label }}>EBITDA Marjı</span>
                        <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.value }}>%22.4</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.42rem', color: C.label }}>Sektör Sıralaması</span>
                        <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.value }}>Top %15</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.42rem', color: C.label }}>Önceki Dönem</span>
                        <span style={{ fontSize: '0.42rem', fontWeight: 700, color: C.label }}>AA</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  )
}
