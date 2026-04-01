import { Building2, GitBranch, BarChart3, TrendingUp, Plus } from 'lucide-react'
import Link from 'next/link'

const STAT_CARDS = [
  { label: 'Kayıtlı Şirket',  value: '0', icon: Building2,  href: '/dashboard/sirketler' },
  { label: 'Aktif Grup',      value: '0', icon: GitBranch,   href: '/dashboard/gruplar' },
  { label: 'Tamamlanan Analiz', value: '0', icon: BarChart3, href: '/dashboard/analiz' },
  { label: 'Ortalama Rating', value: '—',  icon: TrendingUp, href: '/dashboard/analiz' },
]

const QUICK_ACTIONS = [
  { label: 'Yeni Şirket Ekle',    href: '/dashboard/sirketler/yeni',   desc: 'Finansal veri girişi yapın' },
  { label: 'Analiz Başlat',       href: '/dashboard/analiz/yeni',      desc: 'Mevcut verilerle skor hesaplayın' },
  { label: 'Grup Oluştur',        href: '/dashboard/gruplar/yeni',     desc: 'Konsolide analiz için grup tanımlayın' },
  { label: 'Senaryo Simülasyonu', href: '/dashboard/analiz/senaryo',   desc: 'What-if analizi yapın' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-white">Ana Panel</h1>
        <p className="text-white/50 text-sm mt-1">Finrate platformuna hoş geldiniz.</p>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ label, value, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="glass-card p-4 rounded-xl hover:border-cyan-500/30 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/50 text-xs font-medium">{label}</p>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
              </div>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                <Icon size={18} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Hızlı İşlemler */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Hızlı İşlemler
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_ACTIONS.map(({ label, href, desc }) => (
            <Link
              key={label}
              href={href}
              className="glass-card p-4 rounded-xl flex items-center gap-4 hover:border-cyan-500/30 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-cyan-gradient flex items-center justify-center flex-shrink-0">
                <Plus size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-white/40 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Son Analizler (placeholder) */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Son Analizler
        </h2>
        <div className="glass-card rounded-xl p-8 text-center">
          <BarChart3 size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Henüz analiz yapılmadı.</p>
          <Link
            href="/dashboard/analiz/yeni"
            className="inline-block mt-4 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white"
          >
            İlk Analizi Başlat
          </Link>
        </div>
      </div>
    </div>
  )
}
