'use client'

import React, { Suspense, useState, useEffect } from 'react'
import clsx from 'clsx'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'
import { combineScores } from '@/lib/scoring/subjective'
import { scoreToRating } from '@/lib/scoring/score'
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, CartesianGrid, 
  AreaChart, Area 
} from 'recharts'

/* ─── Global Styles for A4 PDF ─── */
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
  
  .print-wrap {
    background: #e2e8f0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    padding: 40px;
    font-family: 'Inter', sans-serif;
  }
  
  @media print {
    .print-wrap { background: white; padding: 0; gap: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pdf-page { box-shadow: none !important; border-radius: 0 !important; }
  }

  .pdf-page {
    width: 794px;
    height: 1123px; /* A4 Ratio */
    background: white;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    position: relative;
    overflow: hidden;
    page-break-after: always;
    page-break-inside: avoid;
    flex-shrink: 0;
  }

  .outfit { font-family: 'Outfit', sans-serif; }
  
  .glow-blob { position: absolute; border-radius: 50%; filter: blur(60px); z-index: 0; pointer-events: none; }

  /* Premium Tablolar */
  .premium-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10px; }
  .premium-table th { 
    text-transform: uppercase; letter-spacing: 1.5px; font-size: 8px; color: #64748b; 
    font-weight: 700; border-bottom: 2px solid #cbd5e1; padding: 14px 12px; text-align: right; 
  }
  .premium-table th:first-child { text-align: left; }
  .premium-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; color: #334155; text-align: right; font-family: monospace; font-size: 11px; transition: background 0.2s; }
  .premium-table tr:hover td { background: #f8fafc; }
  .premium-table td:first-child { text-align: left; font-family: 'Inter', sans-serif; font-weight: 500; font-size: 11px; }
  
  .total-row td { background: #f8fafc; color: #0f172a !important; font-weight: 700 !important; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
  .mega-row td { background: #0f172a !important; color: white !important; font-weight: 800 !important; }

  /* Page Headers */
  .page-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    padding: 40px 50px 20px 50px; border-bottom: 1px solid #e2e8f0; position: relative; z-index: 10;
    background: white;
  }
  .watermark { 
    position: absolute; bottom: 10%; right: -5%; font-size: 180px; font-weight: 900; 
    color: #f8fafc; z-index: 0; font-family: 'Outfit', sans-serif; line-height: 1; text-transform: uppercase; 
    transform: rotate(-10deg); opacity: 0.5; pointer-events: none;
  }

  /* Kategori Barları */
  .prog-track { height: 10px; background: #e2e8f0; border-radius: 999px; position: relative; overflow: visible; }
  .prog-fill { height: 100%; background: linear-gradient(90deg, #0ea5e9 0%, #2dd4bf 100%); border-radius: 999px; transition: width 1s ease-out; }
  .prog-mark { position: absolute; top: -6px; width: 4px; height: 22px; background: #0f172a; border-radius: 4px; z-index: 10; transition: left 1s ease-out;}
`

/* ─── Fmt Helpers ─── */
const fmtTL = (v?: number | null) => {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `₺${(v / 1_000).toFixed(0)}K`
  return `₺${v.toFixed(0)}`
}
const fmtPct = (v?: number | null) => v == null ? '—' : `%${(v * 100).toFixed(1)}`
const fmtN = (v?: number | null, d=2) => v == null ? '—' : v.toFixed(d)
const numF = (v?: number | null) => v == null ? '—' : new Intl.NumberFormat('tr-TR').format(Math.round(v))

/* ─── Reusable PHeader ─── */
const PHeader = ({ num, title, entity, page }: { num: string, title: string, entity: string, page: number }) => (
  <div className="page-header">
    <div>
      <div style={{fontSize:10, color:'#0284c7', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6}}>Bölüm {num}</div>
      <div className="outfit" style={{fontSize:28, fontWeight:800, color:'#0f172a', letterSpacing:-0.5}}>{title}</div>
    </div>
    <div style={{textAlign:'right', color:'#64748b', fontSize:11}}>
      <div style={{fontWeight:600, color:'#0f172a'}}>{entity}</div>
      <div style={{marginTop:4}}>Sayfa {page}</div>
    </div>
  </div>
)

/* =====================================================================
   THE 15 PAGES COMPONENTS
   ===================================================================== */

/* ── Page 1: Ultra Premium Cover ── */
const Page1 = ({ entity, score, rating, type }: any) => {
  const dashOffset = 282.7 - (score/100)*282.7
  return (
    <div className="pdf-page" style={{ background: '#0a192f', color: 'white' }}>
      <div className="glow-blob" style={{width:600, height:600, background: 'radial-gradient(circle, rgba(45, 212, 191, 0.15) 0%, rgba(10, 37, 64, 0) 70%)', top: -100, left: -100}}></div>
      <div className="glow-blob" style={{width:800, height:800, background: 'radial-gradient(circle, rgba(14, 165, 233, 0.18) 0%, rgba(10, 37, 64, 0) 70%)', bottom: -200, right: -200}}></div>
      
      <div style={{position:'absolute', top:0, left:60, width:1, height:'100%', background:'rgba(255,255,255,0.05)'}}></div>
      <div style={{position:'absolute', top:60, left:0, width:'100%', height:1, background:'rgba(255,255,255,0.05)'}}></div>

      <div style={{position:'relative', zIndex:10, padding:60, height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{display:'flex', alignItems:'center', gap:16}}>
            <div className="outfit" style={{width:48, height:48, background:'linear-gradient(135deg, #2dd4bf 0%, #0284c7 100%)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:800,  boxShadow:'0 10px 20px rgba(45,212,191,0.2)'}}>F</div>
            <div className="outfit" style={{fontSize:26, fontWeight:700, letterSpacing:2, color:'white'}}>FINRATE<span style={{color:'#2dd4bf'}}>.</span></div>
          </div>
          <div style={{textAlign:'right', marginTop:10}}>
            <div className="outfit" style={{fontSize:12, color:'#94a3b8', textTransform:'uppercase', letterSpacing:3}}>{"KURUMSAL PREMİUM ANALİZ"}</div>
            <div style={{fontSize:11, color:'#64748b', marginTop:6}}>Erişim: Yetkili Yönetim Kurulu</div>
          </div>
        </div>

        <div style={{marginTop:-120}}>
          <div className="outfit" style={{fontSize:13, color:'#2dd4bf', textTransform:'uppercase', letterSpacing:4, fontWeight:600, marginBottom:30}}>GİZLİ & ÖZEL RESMİ DÖKÜMAN</div>
          <h1 style={{fontSize:68, fontWeight:300, lineHeight:1.1, marginBottom:40, letterSpacing:-1}}>{entity?.split(' ').slice(0, -2).join(' ')}<br/><strong style={{fontWeight:800}}>{entity?.split(' ').slice(-2).join(' ')}</strong></h1>
          
          <div style={{display:'inline-flex', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(20px)', borderRadius:32, padding:40, gap:50, boxShadow:'0 20px 40px rgba(0,0,0,0.4)', transition:'transform 0.3s', cursor:'pointer'}} className="hover:-translate-y-2">
            <div style={{display:'flex', gap:40, alignItems:'center'}}>
              <div style={{position:'relative', width:160, height:160}}>
                <div style={{position:'absolute', inset:0, borderRadius:'50%', background:'#2dd4bf', filter:'blur(25px)', opacity:0.15}}></div>
                <svg viewBox="0 0 100 100" style={{width:'100%', height:'100%', position:'relative', zIndex:10, transform:'rotate(-90deg)'}}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"/>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="url(#grad)" strokeWidth="8" strokeDasharray="282.7" strokeDashoffset={dashOffset} strokeLinecap="round" style={{transition:'stroke-dashoffset 1.5s ease-out'}}/>
                  <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#0284c7"/><stop offset="100%" stopColor="#2dd4bf"/></linearGradient></defs>
                </svg>
                <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:20}}>
                  <div className="outfit" style={{fontSize:42, fontWeight:800, lineHeight:1}}>{Math.round(score)}</div>
                  <div style={{fontSize:11, color:'#94a3b8', fontWeight:500, letterSpacing:1}}>/100</div>
                </div>
              </div>

              <div style={{display:'flex', flexDirection:'column', justifyContent:'center'}}>
                <div style={{fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:3, marginBottom:8}}>Derecelendirme Notu</div>
                <div className="outfit" style={{fontSize:72, fontWeight:900, lineHeight:1, color:'#2dd4bf', textShadow:'0 0 40px rgba(45,212,191,0.5)'}}>{rating}</div>
                <div style={{marginTop:15, padding:'6px 14px', background:'rgba(45,212,191,0.1)', border:'1px solid rgba(45,212,191,0.3)', borderRadius:999, fontSize:10, color:'#2dd4bf', display:'inline-flex', alignItems:'center', gap:8, fontWeight:600}}>
                  <div style={{width:8, height:8, background:'#2dd4bf', borderRadius:'50%', boxShadow:'0 0 10px #2dd4bf'}}></div> {score >= 60 ? 'Yatırım Yapılabilir' : 'Yüksek Risk'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
          <div style={{maxWidth:350, fontSize:10, color:'#64748b', lineHeight:1.7}}>
            Bu rapor, Finrate makine öğrenimi algoritmaları ve güncel BDDK/TCMB sektörel göstergeleri baz alınarak analiz edilmiştir. Paylaşımı izne tabidir.
          </div>
          <div className="outfit" style={{fontSize:12, color:'#94a3b8', letterSpacing:2, fontWeight:700}}>FINRATE.COM</div>
        </div>
      </div>
    </div>
  )
}

/* ── Page 2: Yönetici Özeti ── */
const Page2 = ({ entity, data, ratios: r, score, pageNum, bm }: any) => {
  const d = data ?? {}
  return (
    <div className="pdf-page bg-white">
      <div className="watermark" style={{fontSize:140}}>Özet Vİzyon</div>
      <PHeader num="01" title="Algoritmik Yönetici Özeti" entity={entity} page={pageNum} />
      
      <div style={{padding:'40px 50px', position:'relative', zIndex:10}}>
        <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:40}}>
          
          <div>
            {/* Skor Kartları */}
            <div style={{display:'flex', gap:20, marginBottom:40}}>
              <div style={{flex:1, background:'white', border:'1px solid #e2e8f0', borderRadius:20, padding:30, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.05)', position:'relative', overflow:'hidden', transition:'transform 0.2s', cursor:'pointer'}} className="hover:-translate-y-1">
                <div style={{position:'absolute', top:0, left:0, width:6, height:'100%', background:'#0284c7'}}></div>
                <div style={{fontSize:11, color:'#64748b', textTransform:'uppercase', fontWeight:700, letterSpacing:1.5, marginBottom:12}}>Finansal Ana Skor</div>
                <div className="outfit" style={{fontSize:38, fontWeight:800, color:'#0f172a', lineHeight:1}}>{Math.round(score * 0.82)} <span style={{fontSize:16, color:'#94a3b8', fontWeight:500}}>/100</span></div>
              </div>
              <div style={{flex:1, background:'white', border:'1px solid #e2e8f0', borderRadius:20, padding:30, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.05)', position:'relative', overflow:'hidden', transition:'transform 0.2s', cursor:'pointer'}} className="hover:-translate-y-1">
                <div style={{position:'absolute', top:0, left:0, width:6, height:'100%', background:'#2dd4bf'}}></div>
                <div style={{fontSize:11, color:'#64748b', textTransform:'uppercase', fontWeight:700, letterSpacing:1.5, marginBottom:12}}>Teminat & Subjektif</div>
                <div className="outfit" style={{fontSize:38, fontWeight:800, color:'#0f172a', lineHeight:1}}>{Math.round(score * 0.18)} <span style={{fontSize:16, color:'#94a3b8', fontWeight:500}}>/100</span></div>
              </div>
            </div>

            {/* Kategori Modeli */}
            <div style={{background:'white', border:'1px solid #e2e8f0', borderRadius:20, padding:32, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.05)'}}>
              <div className="outfit" style={{fontSize:16, fontWeight:700, color:'#0f172a', marginBottom:30, display:'flex', justifyContent:'space-between'}}>
                Metrik Sağlamlık Dağılımı
                <div style={{fontSize:10, fontFamily:'Inter', fontWeight:600, color:'#64748b', display:'flex', gap:15, alignItems:'center'}}>
                  <span style={{display:'flex', alignItems:'center', gap:6}}><div style={{width:10, height:10, background:'#2dd4bf', borderRadius:3}}></div> Firma Skoru</span>
                  <span style={{display:'flex', alignItems:'center', gap:6}}><div style={{width:4, height:14, background:'#0f172a', borderRadius:2}}></div> Sektör Benchmark</span>
                </div>
              </div>
              
              {[
                { label: 'Likidite Gücü', val: Math.min((r?.currentRatio ?? 0.8)*45, 100), sec: 50 },
                { label: 'Kârlılık Oranları', val: Math.min((r?.netProfitMargin ?? 0.05)*600 + 40, 100), sec: 45 },
                { label: 'Kaldıraç & Borçlanma', val: Math.max(100 - (r?.debtToEquity ?? 1.5)*20, 0), sec: 60 },
                { label: 'Operasyonel Verim', val: Math.min((r?.assetTurnover ?? 1.2)*60, 100), sec: 65 }
              ].map((item, i) => (
                <div key={item.label} style={{marginBottom: i === 3 ? 0 : 25}}>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:10, fontWeight:600}}>
                    <span style={{color:'#334155'}}>{item.label}</span>
                    <span className="outfit" style={{color:'#0f172a', fontSize:16, fontWeight:700}}>{Math.round(item.val)} <span style={{color:'#94a3b8', fontSize:11, fontWeight:500}}>/100</span></span>
                  </div>
                  <div className="prog-track">
                    <div className="prog-fill" style={{width: `${item.val}%`}}></div>
                    <div className="prog-mark" style={{left: `${item.sec}%`}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:15, marginBottom:30}}>
              {/* Premium Mini Kartlar */}
              {[
                { l: 'Net Satışlar (Yıllık)', v: fmtTL(d.revenue), b: 'rgba(2,132,199,0.05)', c: '#0284c7' },
                { l: 'Faaliyet Kârı (EBIT)', v: fmtTL(d.ebit), b: 'rgba(45,212,191,0.05)', c: '#0f766e' },
                { l: 'Cari Oran', v: fmtN(r?.currentRatio) + 'x', b: '#f8fafc', c: '#0f172a' },
                { l: 'Borç / Özsermaye', v: fmtN(r?.debtToEquity) + 'x', b: (r?.debtToEquity > 1.5 ? '#fff1f2' : '#f8fafc'), c: (r?.debtToEquity > 1.5 ? '#be123c' : '#0f172a') }
              ].map((k, i) => (
                <div key={i} style={{background: k.b, border:'1px solid #e2e8f0', borderRadius:16, padding:20, transition:'all 0.2s', cursor:'pointer'}} className="hover:shadow-md hover:-translate-y-1">
                  <div style={{fontSize:9, color:'#64748b', fontWeight:700, textTransform:'uppercase', letterSpacing:1}}>{k.l}</div>
                  <div className="outfit" style={{fontSize:22, fontWeight:700, color: k.c, margin:'8px 0 0 0'}}>{k.v}</div>
                </div>
              ))}
            </div>

            <div style={{background:'#0f172a', borderRadius:20, padding:32, color:'white', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.3)'}}>
              <div className="outfit" style={{fontSize:14, fontWeight:700, marginBottom:16, color:'#2dd4bf', letterSpacing:1, textTransform:'uppercase'}}>Algoritmik Yorum</div>
              <p style={{fontSize:12, color:'#cbd5e1', lineHeight:1.7, marginBottom:16}}>Firma {score >= 60 ? "mevcut makro koşullarda kârlılığını güçlü tutarak sektör ortalamalarının üzerinde bir ivme yakalamıştır." : "yüksek kaldıraç ve düşük kârlılık sarmalı nedeniyle acil yapılandırma aksiyonlarına ihtiyaç duymaktadır."} Özellikle nakit yönetimi ve stok devir hızındaki gelişim yakından izlenmektedir.</p>
              <p style={{fontSize:12, color:'#cbd5e1', lineHeight:1.7}}>Yapay Zeka Risk Klasmanı: <span style={{fontWeight:800, color:'white', background:'rgba(255,255,255,0.1)', padding:'2px 8px', borderRadius:6}}>{score >= 60 ? 'Kabul Edilebilir Risk' : 'Zayıf Halka'}</span></p>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}

/* ── Pages 3/4: Ratios ── */
const RatioRow = ({ label, val, avg, good }:any) => (
  <tr className="hover:bg-slate-50 transition-colors">
    <td style={{fontWeight:600}}>{label}</td>
    <td style={{fontSize:12}}>{val}</td>
    <td style={{fontSize:12}}>{avg}</td>
    <td style={{textAlign:'center'}}>
      <span style={{padding:'6px 12px', borderRadius:6, fontSize:9, fontWeight:800, backgroundColor: good ? '#dcfce7' : '#fee2e2', color: good ? '#166534' : '#991b1b', letterSpacing:1}}>{good ? 'GÜÇLÜ' : 'RİSKLİ'}</span>
    </td>
  </tr>
)

const PageRatios = ({ entity, ratios: r, bm, section, isLiq, pageNum }: any) => {
  return (
    <div className="pdf-page bg-white">
      <div className="watermark">{section}</div>
      <PHeader num={isLiq ? '02' : '03'} title={`${section} Göstergeleri`} entity={entity} page={pageNum} />
      
      <div style={{padding:'30px 50px', position:'relative', zIndex:10}}>
        <div style={{background:'white', border:'1px solid #e2e8f0', borderRadius:16, overflow:'hidden', boxShadow:'0 10px 25px -5px rgba(0,0,0,0.05)'}}>
          <div style={{background:'#f8fafc', padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div className="outfit" style={{fontSize:16, fontWeight:700, color:'#0f172a'}}>Kritik Performans Çarpanları</div>
            <div style={{fontSize:10, background:'rgba(2,132,199,0.1)', color:'#0284c7', padding:'6px 14px', borderRadius:999, fontWeight:700, letterSpacing:1}}>SEKTÖR BAZLI KIYAS: {bm.label.toUpperCase()}</div>
          </div>
          <table className="premium-table">
            <thead>
              <tr><th>Rasyo / Oran Adı</th><th>Firma Değeri</th><th>Sektör Benchmark</th><th style={{textAlign:'center'}}>Derin Analiz Sonucu</th></tr>
            </thead>
            <tbody>
              {isLiq ? (
                <>
                  <tr className="total-row"><td colSpan={4} style={{background:'#f1f5f9', color:'#475569', fontSize:11, letterSpacing:2}}>LİKİDİTE GÖSTERGELERİ (NAKİT ÜRETME GÜCÜ)</td></tr>
                  <RatioRow label="Cari Oran" val={fmtN(r?.currentRatio)} avg={fmtN(bm?.currentRatio)} good={r?.currentRatio >= bm?.currentRatio * 0.9} />
                  <RatioRow label="Asit-Test (Likidite) Oranı" val={fmtN(r?.quickRatio)} avg={fmtN(bm?.quickRatio)} good={r?.quickRatio >= bm?.quickRatio * 0.9} />
                  <RatioRow label="Nakit Oranı" val={fmtN(r?.cashRatio)} avg="—" good={r?.cashRatio >= 0.15} />
                  
                  <tr className="total-row"><td colSpan={4} style={{background:'#f1f5f9', color:'#475569', fontSize:11, letterSpacing:2}}>KALDIRAÇ VE BORÇLANMA KAPASİTESİ</td></tr>
                  <RatioRow label="Borç / Özkaynak (D/E)" val={fmtN(r?.debtToEquity)} avg={fmtN(bm?.debtToEquity)} good={r?.debtToEquity <= bm?.debtToEquity * 1.2} />
                  <RatioRow label="Kısa Vadeli Borç / Toplam Borç" val={fmtPct(r?.shortTermDebtRatio)} avg="—" good={r?.shortTermDebtRatio < 0.65} />
                </>
              ) : (
                <>
                 <tr className="total-row"><td colSpan={4} style={{background:'#f1f5f9', color:'#475569', fontSize:11, letterSpacing:2}}>KÂRLILIK VE MARJ DEĞERLENDİRMESİ</td></tr>
                 <RatioRow label="Brüt Kâr Marjı" val={fmtPct(r?.grossMargin)} avg={fmtPct(bm?.grossMargin)} good={r?.grossMargin >= bm?.grossMargin * 0.9} />
                 <RatioRow label="FAVÖK (EBITDA) Marjı" val={fmtPct(r?.ebitdaMargin)} avg={fmtPct(bm?.ebitdaMargin)} good={r?.ebitdaMargin >= bm?.ebitdaMargin * 0.9} />
                 <RatioRow label="Net Kâr Marjı" val={fmtPct(r?.netProfitMargin)} avg={fmtPct(bm?.netProfitMargin)} good={r?.netProfitMargin >= bm?.netProfitMargin * 0.9} />
                 <RatioRow label="Özkaynak Kârlılığı (ROE)" val={fmtPct(r?.roe)} avg={fmtPct(bm?.roe)} good={r?.roe >= bm?.roe * 0.85} />
                 
                 <tr className="total-row"><td colSpan={4} style={{background:'#f1f5f9', color:'#475569', fontSize:11, letterSpacing:2}}>FAALİYET VE VERİMLİLİK</td></tr>
                 <RatioRow label="Aktif Devir Hızı" val={fmtN(r?.assetTurnover)} avg={fmtN(bm?.assetTurnover)} good={r?.assetTurnover >= bm?.assetTurnover * 0.8} />
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── Page 5: Trends with INTERACTIVE RECHARTS ── */
const Page5_Trends = ({ entity, analyses, pageNum }: any) => {
  // Map data for recharts
  const chartData = analyses.map((a:any) => ({
    name: String(a.year || a._tmpYear),
    revenue: a.financialData?.revenue || 0,
    ebit: a.financialData?.ebit || 0,
    margin: ((a.financialData?.ebit || 0) / Math.max(a.financialData?.revenue || 1, 1)) * 100
  }))

  const formatB = (val: number) => `₺${(val/1e6).toFixed(1)}M`

  return (
    <div className="pdf-page bg-white">
      <div className="watermark">TRENDLER</div>
      <PHeader num="04" title="Tarihsel Eğilim ve Trend Analizi" entity={entity} page={pageNum} />
      <div style={{padding:'40px 50px', position:'relative', zIndex:10}}>
        
        <div style={{background:'white', border:'1px solid #e2e8f0', borderRadius:20, padding:35, boxShadow:'0 10px 25px -5px rgba(0,0,0,0.05)', marginBottom:40}}>
           <div className="outfit" style={{fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:20}}>Büyüme İvmesi: Satışlar vs. Operasyonel Kâr</div>
           <div style={{height: 320, width: '100%'}}>
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12, fontWeight:600}} dy={10} />
                 <YAxis yAxisId="left" tickFormatter={formatB} axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:11}} dx={-10}/>
                 <RechartsTooltip 
                    cursor={{fill:'rgba(241,245,249,0.5)'}}
                    contentStyle={{borderRadius:12, border:'none', boxShadow:'0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight:600, fontSize:12}}
                    formatter={(val:number) => numF(val) + " TL"}
                  />
                 <Legend wrapperStyle={{paddingTop:20, fontSize:12, fontWeight:600}} />
                 <Bar yAxisId="left" dataKey="revenue" name="Net Satışlar" fill="#0284c7" radius={[6,6,0,0]} barSize={40} />
                 <Bar yAxisId="left" dataKey="ebit" name="Faaliyet Kârı (EBIT)" fill="#2dd4bf" radius={[6,6,0,0]} barSize={40} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

        <div style={{background:'white', border:'1px solid #e2e8f0', borderRadius:20, padding:35, boxShadow:'0 10px 25px -5px rgba(0,0,0,0.05)'}}>
           <div className="outfit" style={{fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:20}}>Faaliyet Kâr Marjı Gelişimi (%)</div>
           <div style={{height: 250, width: '100%'}}>
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12, fontWeight:600}} dy={10} />
                 <YAxis tickFormatter={(v)=>v.toFixed(1)+'%'} axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:11}} dx={-10}/>
                 <RechartsTooltip 
                    contentStyle={{borderRadius:12, border:'none', boxShadow:'0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight:600, fontSize:12}}
                    formatter={(val:number) => val.toFixed(1) + "%"}
                  />
                 <Area type="monotone" dataKey="margin" name="FAVÖK/EBIT Marjı" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorMargin)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

      </div>
    </div>
  )
}

/* ── Generic Static Placeholders for 8-page completion ── */
const GenericStaticPage = ({num, title, subtitle, content, entity, page}:any) => (
  <div className="pdf-page bg-white">
    <div className="watermark" style={{opacity:0.1}}>{title.split(' ')[0]}</div>
    <PHeader num={num} title={title} entity={entity} page={page} />
    <div style={{padding:'40px 50px', position:'relative', zIndex:10}}>
      <div style={{background:'#f8fafc', border:'1px dashed #cbd5e1', borderRadius:20, padding:60, textAlign:'center'}}>
        <div style={{width:80, height:80, background:'white', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 30px auto', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.05)'}}>
          <div style={{fontSize:30}}>📊</div>
        </div>
        <div className="outfit" style={{fontSize:24, fontWeight:800, color:'#0f172a', marginBottom:16}}>{subtitle}</div>
        <div style={{fontSize:14, color:'#64748b', lineHeight:1.8, maxWidth:500, margin:'0 auto'}}>{content}</div>
      </div>
    </div>
  </div>
)

/* ── Premium TDHP Balance Tables ── */
const Page_BilançoTable = ({ entity, data, num, title, fields, pageNum }: any) => {
  const years = data.map((d:any) => d._tmpYear || d.year || 'Yıl')
  return (
    <div className="pdf-page bg-white">
      <div className="watermark" style={{opacity:0.15, fontSize:120}}>{title.split('(')[0].trim()}</div>
      <PHeader num={num} title={title} entity={entity} page={pageNum} />
      <div style={{padding:'30px 50px', position:'relative', zIndex:10}}>
        <div style={{background:'white', border:'1px solid #e2e8f0', borderRadius:16, overflow:'hidden', boxShadow:'0 10px 25px -5px rgba(0,0,0,0.05)'}}>
          <div style={{background:'#0f172a', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', color:'white'}}>
            <div className="outfit" style={{fontSize:16, fontWeight:700, letterSpacing:1}}>ÇOK YILLIK BİLANÇO DÖKÜMÜ</div>
            <div style={{fontSize:10, background:'rgba(255,255,255,0.1)', padding:'6px 14px', borderRadius:999, fontWeight:700}}>TUM DEGELER (TL)</div>
          </div>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{paddingLeft:24}}>Finansal Kalemler</th>
                {years.map((y:any, i:number) => <th key={i}>{y} Denetim</th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map((f:any, idx:number) => (
                <tr key={idx} className={clsx(f.total && "total-row", f.mega && "mega-row")}>
                  <td style={{paddingLeft:24}}>{f.label}</td>
                  {data.map((d:any, i:number) => (
                    <td key={i}>{numF(d[f.key] || 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ─── */
function UltraPremiumRaporContent() {
  const params = useSearchParams()
  const id     = params.get('id')
  const type   = params.get('type') || 'premium' // default numune is premium
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selected, setSelected] = useState<Analysis | null>(null)
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 15 Sayfalık Harika Numune Modu ('demo' id'si veya id yoksa demo üretilir)
    if (!id || id === 'demo') {
      const demoHData = [
        { _tmpYear: 2024, revenue: 52400000, cogs: -30100000, grossProfit: 22300000, operatingExpenses: -10500000, ebit: 11800000, ebitda: 14200000, netProfit: 9800000, cash: 4100000, tradeReceivables: 21800000, inventory: 9100000, totalCurrentAssets: 35000000, tangibleAssets: 29000000, intangibleAssets: 5700000, totalNonCurrentAssets: 34700000, totalAssets: 69700000, shortTermFinancialDebt: 8000000, tradePayables: 10300000, totalCurrentLiabilities: 18300000, longTermFinancialDebt: 12400000, totalNonCurrentLiabilities: 12400000, paidCapital: 10000000, retainedEarnings: 19200000, totalEquity: 39000000, totalLiabilitiesAndEquity: 69700000, interestExpense: -1500000 },
        { _tmpYear: 2023, revenue: 41200000, cogs: -24500000, grossProfit: 16700000, operatingExpenses: -8200000, ebit: 8500000, ebitda: 10500000, netProfit: 7100000, cash: 3500000, tradeReceivables: 19500000, inventory: 8000000, totalCurrentAssets: 31000000, tangibleAssets: 27000000, intangibleAssets: 5000000, totalNonCurrentAssets: 32000000, totalAssets: 63000000, shortTermFinancialDebt: 7000000, tradePayables: 11000000, totalCurrentLiabilities: 18000000, longTermFinancialDebt: 15000000, totalNonCurrentLiabilities: 15000000, paidCapital: 10000000, retainedEarnings: 12900000, totalEquity: 30000000, totalLiabilitiesAndEquity: 63000000, interestExpense: -1200000 },
        { _tmpYear: 2022, revenue: 32500000, cogs: -19800000, grossProfit: 12700000, operatingExpenses: -6100000, ebit: 6600000, ebitda: 8600000, netProfit: 5400000, cash: 1850000, tradeReceivables: 18000000, inventory: 8150000, totalCurrentAssets: 28000000, tangibleAssets: 25000000, intangibleAssets: 5000000, totalNonCurrentAssets: 30000000, totalAssets: 58000000, shortTermFinancialDebt: 6000000, tradePayables: 11000000, totalCurrentLiabilities: 17000000, longTermFinancialDebt: 11000000, totalNonCurrentLiabilities: 11000000, paidCapital: 10000000, retainedEarnings: 14600000, totalEquity: 30000000, totalLiabilitiesAndEquity: 58000000, interestExpense: -800000 },
        { _tmpYear: 2021, revenue: 25800000, cogs: -15200000, grossProfit: 10600000, operatingExpenses: -5400000, ebit: 5200000, ebitda: 6200000, netProfit: 4500000, cash: 1240000, tradeReceivables: 15400000, inventory: 7360000, totalCurrentAssets: 24000000, tangibleAssets: 20000000, intangibleAssets: 4000000, totalNonCurrentAssets: 24000000, totalAssets: 48000000, shortTermFinancialDebt: 5000000, tradePayables: 9000000, totalCurrentLiabilities: 14000000, longTermFinancialDebt: 12000000, totalNonCurrentLiabilities: 12000000, paidCapital: 10000000, retainedEarnings: 7500000, totalEquity: 22000000, totalLiabilitiesAndEquity: 48000000, interestExpense: -500000 }
      ]
      setHistoricalData(demoHData)
      setSelected({
        id: 'demo', year: 2024, period: 'Yıllık',
        finalScore: 74, finalRating: 'BBB+',
        ratios: { currentRatio: 1.91, quickRatio: 1.41, cashRatio: 0.22, debtToEquity: 0.78, grossMargin: 0.42, ebitdaMargin: 0.27, netProfitMargin: 0.18, roe: 0.25, assetTurnover: 0.75, shortTermDebtRatio: 0.31 },
        entity: { id: 'demo1', name: 'ATLAS MAKİNA SANAYİ A.Ş.', sector: 'IML' },
        financialData: demoHData[0]
      } as any)
      setAnalyses(demoHData.map(d => ({year: d._tmpYear, financialData: d})) as any)
      setLoading(false)
      return
    }

    // Normal flow...
    fetch('/api/analyses').then(r => r.json()).then(d => {
      const list = d.analyses ?? []
      setAnalyses(list)
      const found = list.find((a: Analysis) => a.id === id)
      setSelected(found ?? null)
      if (found?.entity?.id) {
        fetch(`/api/entities/${found.entity.id}`).then(r => r.ok ? r.json() : null)
          .then(res => { 
            const hist = res?.entity?.financialData || []
            hist.forEach((h:any, i:number) => { h._tmpYear = 2024 - i })
            setHistoricalData(hist.reverse())
          })
      }
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-20 text-center flex flex-col items-center"><Loader2 className="animate-spin w-8 h-8 text-sky-600 mb-4"/> Rapor Derleniyor...</div>
  if (!selected) return <div className="p-20 text-center">Analiz bulunamadı. URL'i ?id=demo yaparak numuneyi test edebilirsiniz.</div>

  const cs = selected.id === 'demo' ? 74 : combineScores(selected.finalScore, 0)
  const cr = selected.id === 'demo' ? 'BBB+' : scoreToRating(cs)
  const entityName = selected.entity?.name ?? 'Şirket A.Ş.'
  const bm = getSectorBenchmark(selected.entity?.sector)
  
  const entityAnalyses = analyses.sort((a,b) => a.year - b.year)
  const hData = historicalData.length ? historicalData : [selected.financialData].filter(Boolean)

  return (
    <div className="print-wrap">
      <style>{styles}</style>
      
      {/* ── Standart İlk 8 Sayfa ── */}
      <Page1 entity={entityName} score={cs} rating={cr} type={type} />
      <Page2 entity={entityName} data={selected.financialData} ratios={selected.ratios} score={cs} year={selected.year} pageNum={2} bm={bm}/>
      <PageRatios entity={entityName} ratios={selected.ratios} bm={bm} section="Likidite" isLiq={true} pageNum={3} />
      <PageRatios entity={entityName} ratios={selected.ratios} bm={bm} section="Kârlılık" isLiq={false} pageNum={4} />
      <Page5_Trends entity={entityName} analyses={entityAnalyses} pageNum={5} />
      <GenericStaticPage num="05" title="Senaryo Simülasyonu" subtitle="Kaldıraç Optimizasyon Motoru" content="Buraya kullanıcının dashboard'da deneyimlediği 'Borç 5M azalsaydı not ne olurdu?' What-If senaryo sonuçları basılacaktır." entity={entityName} page={6} />
      <GenericStaticPage num="06" title="Rating Artırıcı Aksiyon Planı" subtitle="Yapay Zeka Destekli Reçete" content="Firmanın skorunu artırmak için atması gereken makro ve mikro finansal adımların madde madde dökümü." entity={entityName} page={7} />
      <GenericStaticPage num="07" title="Kurumsal Analiz Metodolojisi" subtitle="Derecelendirme Kriterleri" content="Modelin arkasında yatan matematik, KKB Kredi Kayıt Bürosu korelasyonları ve bankacılık standartları açıklaması." entity={entityName} page={8} />

      {/* ── Kurumsal Ekstra 7 Sayfa (Toplam 15) ── */}
      {type === 'premium' && (
        <>
          <GenericStaticPage num="08" title="Makroekonomik Vizyon & Sektörel Yorum" subtitle="TCMB ve BDDK Projeksiyonu" content="Firmanın bulunduğu İmalat (IML) sektörüne dair 2024 yılına özel arz-talep ve finansman maliyetleri raporlaması." entity={entityName} page={9} />
          
          <Page_BilançoTable entity={entityName} data={hData} num="09" title="Kapsamlı Bilanço (Dönen Varlıklar)" pageNum={10} fields={[
            { label: 'Hazır Değerler (Kasa & Banka)', key: 'cash' },
            { label: 'Ticari Alacaklar (Kısa Vadeli)', key: 'tradeReceivables' },
            { label: 'Stoklar', key: 'inventory' },
            { label: 'TOPLAM DÖNEN VARLIKLAR', key: 'totalCurrentAssets', total: true }
          ]}/>
          
          <Page_BilançoTable entity={entityName} data={hData} num="10" title="Kapsamlı Bilanço (Duran Varlıklar)" pageNum={11} fields={[
            { label: 'Maddi Duran Varlıklar', key: 'tangibleAssets' },
            { label: 'Maddi Olmayan Duran Varlıklar', key: 'intangibleAssets' },
            { label: 'TOPLAM DURAN VARLIKLAR', key: 'totalNonCurrentAssets', total: true },
            { label: 'AKTİF TOPLAMI (BÜYÜKLÜK)', key: 'totalAssets', mega: true }
          ]}/>
          
          <Page_BilançoTable entity={entityName} data={hData} num="11" title="Kapsamlı Bilanço (Kısa Vadeli Kaynaklar)" pageNum={12} fields={[
            { label: 'Kısa Vadeli Finansal Borçlar (Krediler)', key: 'shortTermFinancialDebt' },
            { label: 'Ticari Borçlar (Satıcılar)', key: 'tradePayables' },
            { label: 'TOPLAM KISA VADELİ YÜKÜMLÜLÜKLER', key: 'totalCurrentLiabilities', mega: true },
          ]}/>

          <Page_BilançoTable entity={entityName} data={hData} num="12" title="Kapsamlı Bilanço (Uzun Vade & Özkaynak)" pageNum={13} fields={[
            { label: 'Uzun Vadeli Finansal Borçlar', key: 'longTermFinancialDebt' },
            { label: 'Ödenmiş Sermaye', key: 'paidCapital' },
            { label: 'Geçmiş Yıllar Kâr/Zararı', key: 'retainedEarnings' },
            { label: 'Dönem Net Kârı', key: 'netProfit' },
            { label: 'TOPLAM ÖZKAYNAKLAR', key: 'totalEquity', total: true },
            { label: 'PASİF TOPLAMI', key: 'totalLiabilitiesAndEquity', mega: true }
          ]}/>

          <Page_BilançoTable entity={entityName} data={hData} num="13" title="Kapsamlı Gelir Tablosu" pageNum={14} fields={[
            { label: 'Yurt İçi ve Yurt Dışı Satışlar', key: 'revenue' },
            { label: 'Satışların Maliyeti (-)', key: 'cogs' },
            { label: 'BRÜT SATIŞ KÂRI', key: 'grossProfit', total: true },
            { label: 'Faaliyet Giderleri (-)', key: 'operatingExpenses' },
            { label: 'FAALİYET KÂRI (EBIT)', key: 'ebit', total: true },
            { label: 'FAVÖK (EBITDA)', key: 'ebitda' },
            { label: 'Finansman Gideri (-)', key: 'interestExpense' },
            { label: 'DÖNEM NET KÂRI', key: 'netProfit', mega: true }
          ]}/>
          
          <div className="pdf-page" style={{ background: '#0a192f', color: 'white', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center' }}>
            <div className="glow-blob" style={{width:600, height:600, background: 'radial-gradient(circle, rgba(45, 212, 191, 0.1) 0%, rgba(10, 37, 64, 0) 70%)'}}></div>
            <div className="outfit" style={{fontSize:48, fontWeight:800, letterSpacing:4, zIndex:10, marginBottom:20}}>FINRATE.</div>
            <div style={{fontSize:12, color:'#94a3b8', zIndex:10, letterSpacing:2}}>www.finrate.com | Gizli Kurumsal Rapor</div>
          </div>
        </>
      )}

    </div>
  )
}

export default function UltraPremiumRapor() {
  return (
    <Suspense fallback={<div className="p-20 text-center">Yükleniyor...</div>}>
      <UltraPremiumRaporContent />
    </Suspense>
  )
}
