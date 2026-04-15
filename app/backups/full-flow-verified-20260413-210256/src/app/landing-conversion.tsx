'use client'

import Link from 'next/link'
import { ArrowRight, ShieldCheck, FileText, BarChart, Check, Shield, Lock } from 'lucide-react'
import RatiosTable from '@/components/analysis/RatiosTable'
import { Logo } from '@/components/ui/Logo'

const MOCK_RATIOS = [
  { label: 'Cari Oran', value: '1.85', avg: '1.42', status: 'positive' as const },
  { label: 'Asit-Test Oranı', value: '1.24', avg: '0.95', status: 'positive' as const },
  { label: 'Borç/Özkaynak', value: '0.62', avg: '1.20', status: 'positive' as const },
  { label: 'Stok Devir Süresi', value: '42 gün', avg: '55 gün', status: 'positive' as const },
  { label: 'Alacak Tahsil Süresi', value: '68 gün', avg: '60 gün', status: 'warning' as const },
  { label: 'EBITDA Marjı', value: '%18.4', avg: '%12.5', status: 'positive' as const },
]

export default function LandingConversionPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
          <Link href="/" aria-label="Finrate ana sayfa">
            <Logo showSubtext={false} />
          </Link>
          
          <div className="hidden md:flex items-center gap-8 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            <Link href="#nasil" className="hover:text-[#0B3C5D] transition-colors">YÖNTEM</Link>
            <Link href="#gostergeler" className="hover:text-[#0B3C5D] transition-colors">TEKNİK ALTYAPI</Link>
            <Link href="#guven" className="hover:text-[#0B3C5D] transition-colors">GÜVENLİK</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/giris" className="text-[11px] font-bold text-slate-600 hover:text-[#0B3C5D] transition-colors uppercase tracking-widest">
              Giriş Yap
            </Link>
            <Link href="/kayit" className="bg-[#0B3C5D] text-white px-5 py-2.5 rounded-[4px] text-[11px] font-bold uppercase tracking-widest hover:bg-[#072b43] transition-colors">
              ÜCRETSİZ BAŞLAT
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[#F8FAFC] border border-slate-200 text-slate-600 text-[10px] font-bold tracking-widest uppercase mb-6">
              <ShieldCheck size={14} className="text-[#0B3C5D]" />
              Denetİm Sınıfı Finansal Karar Sİstemİ
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-black text-[#0B3C5D] leading-[1.05] tracking-tight mb-8">
              Kredi Reddini <br />
              <span className="text-slate-400">Önceden Görün.</span>
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-lg mb-10">
              Bilanço ve mizanınızı sisteme yükleyin; bankacılık standartlarındaki 25 temel rasyo ile risk derecenizi, limitlerinizi ve kredi skorunuzu artırma yollarını anında görün.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/kayit" className="bg-[#0B3C5D] text-white px-8 py-3.5 rounded-[4px] text-sm font-bold hover:bg-[#072b43] transition-colors flex items-center gap-2 border border-transparent">
                ÜCRETSİZ ANALİZ BAŞLAT <ArrowRight size={16} />
              </Link>
              <Link href="#ornek-rapor" className="bg-white text-slate-600 border border-slate-300 px-8 py-3.5 rounded-[4px] text-sm font-bold hover:bg-slate-50 transition-colors">
                ÖRNEK RAPOR İNCELE
              </Link>
            </div>
            
            {/* Trust Blocks */}
            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 pt-6 border-t border-slate-100">
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 tracking-widest">
                  <Shield size={14} className="text-slate-400" />
                  KVKK / GDPR Uyumlu
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 tracking-widest">
                  <FileText size={14} className="text-slate-400" />
                  TCMB Standartları
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 tracking-widest">
                  <Lock size={14} className="text-slate-400" />
                  256-BİT SSL
               </div>
            </div>
          </div>

          {/* Clean Mockup (Physical Report Feel) */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative bg-white w-full max-w-[440px] aspect-[1/1.4] rounded-[2px] border-[0.5px] border-slate-300 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8">
              {/* Fake Stamp */}
              <div className="absolute top-8 right-8 w-16 h-16 rounded-full border-2 border-emerald-600/30 text-emerald-700/60 font-black text-[10px] flex items-center justify-center transform rotate-12 uppercase tracking-widest text-center leading-none">
                ONSİTE<br/>DENETİM
              </div>
              
              <div className="border-b-2 border-[#0B3C5D] pb-4 mb-6">
                 <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">KRİDİBİLİTE RAPORU</div>
                 <div className="text-xl font-black text-[#0B3C5D]">FINRATE ANALİTİK</div>
                 <div className="text-[10px] text-slate-500 mt-1">RAPOR NO: TR-2026-8492</div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                 <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1">FİNRATE SKORU</div>
                    <div className="text-3xl font-black text-[#0B3C5D]">74<span className="text-sm text-slate-300">/100</span></div>
                 </div>
                 <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1">KREDİ NOTU</div>
                    <div className="text-3xl font-black text-[#0B3C5D]">BBB+</div>
                 </div>
              </div>

              <div className="space-y-4">
                 <div>
                   <div className="text-[9px] font-bold text-[#0B3C5D] border-b border-slate-200 pb-1 mb-2 uppercase tracking-widest">Yürütme Özeti</div>
                   <div className="text-[10px] text-slate-600 leading-relaxed font-medium">
                      Likidite gücü sektör ortalamasının üzerindedir. Kısa vadeli yükümlülükler teminatsız ödenebilir. Karlılık oranları risksiz bölgededir.
                   </div>
                 </div>
                 <div>
                   <div className="text-[9px] font-bold text-[#0B3C5D] border-b border-slate-200 pb-1 mb-2 uppercase tracking-widest">Banka Aksiyon Planı</div>
                   <div className="space-y-2">
                       <div className="flex items-start gap-2">
                          <Check size={12} className="text-slate-400 mt-0.5" />
                          <div className="text-[9px] text-slate-600"><strong className="text-[#0B3C5D]">Cari Oran</strong> %15 seviyesinde yapılandırılmalı. (+4 Puan)</div>
                       </div>
                       <div className="flex items-start gap-2">
                          <Check size={12} className="text-slate-400 mt-0.5" />
                          <div className="text-[9px] text-slate-600"><strong className="text-[#0B3C5D]">Stok Devir</strong> süresi 5 gün kısaltılmalı. (+2 Puan)</div>
                       </div>
                   </div>
                 </div>
              </div>

              {/* Watermark */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
                 <Shield size={240} className="text-[#0B3C5D]" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Ratios Table Section */}
      <section id="gostergeler" className="py-24 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto px-6">
           <div className="grid lg:grid-cols-12 gap-16 items-start">
              
              <div className="lg:col-span-4">
                 <h2 className="text-3xl font-display font-black text-[#0B3C5D] mb-4">
                   Gerçek Bankacılık Metrikleri
                 </h2>
                 <p className="text-slate-600 text-sm leading-relaxed mb-8">
                   Finrate, işletmenizin finansallarını klasik muhasebe programları gibi listelemez. Banka yöneticilerinin önüne giden 25 temel göstergeyi, sektör ortalamaları ile kıyaslayarak size net bir risk tablosu çıkarır.
                 </p>
                 <div className="space-y-2">
                    {['Likidite Rasyoları', 'Karlılık Göstergeleri', 'Kaldıraç ve Borçluluk', 'Faaliyet Etkinliği'].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border-b border-slate-200">
                         <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{item}</span>
                      </div>
                    ))}
                 </div>
              </div>
              
              <div className="lg:col-span-8">
                 <RatiosTable ratios={MOCK_RATIOS} />
              </div>
           </div>
        </div>
      </section>

      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Link href="/" aria-label="Finrate ana sayfa">
              <Logo showSubtext={false} className="scale-75 origin-left" />
            </Link>
            <div>© 2026 FINRATE ANALYTICS · İKİZ YAZILIM LTD</div>
            <div className="flex gap-6">
                <Link href="#" className="hover:text-[#0B3C5D]">GİZLİLİK</Link>
                <Link href="#" className="hover:text-[#0B3C5D]">ŞARTLAR</Link>
            </div>
        </div>
      </footer>
    </div>
  )
}
