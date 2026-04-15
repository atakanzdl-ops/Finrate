const FEATURES = [
  {
    tag: 'Analiz',
    title: '25 Finansal Oran',
    description:
      'Likidite, kârlılık, borçluluk ve faaliyet verimliliği — 4 kategoride bankerin baktığı tüm oranlar tek ekranda.',
    highlight: 'Cari Oran · ROE · Net Borç/FAVÖK · DSO · CCC',
    gradient: 'from-cyan-500/20 to-blue-600/10',
  },
  {
    tag: 'Grup',
    title: 'Konsolide Analiz',
    description:
      'Holding yapıları ve bağlı ortaklıklar için otomatik intercompany eliminasyon. Grubun gerçek finansal tablosu.',
    highlight: 'IC Eliminasyon · Ağırlıklı Skor · Yapısal Risk Faktörü',
    gradient: 'from-violet-500/20 to-blue-600/10',
  },
  {
    tag: 'Senaryo',
    title: 'Gerçek Zamanlı What-If',
    description:
      'KV borç → UV\'ye çevir, sermaye artır, satış büyüt — her hareket anında rating\'e yansır. Slider ile sürükle, notu gör.',
    highlight: '10 Finansal Hareket · Anlık Hesaplama · PDF Senaryo Raporu',
    gradient: 'from-emerald-500/20 to-cyan-600/10',
  },
  {
    tag: 'Düzeltme',
    title: 'Manuel Tenzilat',
    description:
      'Tek seferlik gelirleri çıkar, bilanço dışı yükümlülükleri ekle. Analistin bildiği ama sistemin göremediği.',
    highlight: '12 Düzeltme Tipi · Yıl Bazlı · Denetim Kaydı',
    gradient: 'from-orange-500/20 to-red-600/10',
  },
  {
    tag: 'Rapor',
    title: 'Banka Standartı PDF',
    description:
      'Tüm analizleri, düzeltmeleri ve senaryoyu bankaya teslim edilebilir, profesyonel PDF formatında indirin.',
    highlight: 'Otomatik Rapor · Tenzilat Özeti · Senaryo Sayfası',
    gradient: 'from-blue-500/20 to-indigo-600/10',
  },
  {
    tag: 'KVKK',
    title: 'Güvenli & Uyumlu',
    description:
      'Verileriniz AB\'de (Almanya) Hetzner sunucularında saklanır. KVKK uyumlu altyapı, şifreli bağlantı.',
    highlight: 'KVKK Uyumlu · AB Sunucu · SSL/TLS Şifreleme',
    gradient: 'from-slate-500/20 to-gray-600/10',
  },
]

export default function Features() {
  return (
    <section id="cozumler" className="relative py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Başlık */}
        <div className="text-center mb-16">
          <span className="text-cyan-500 text-sm font-semibold tracking-widest uppercase mb-3 block">
            Özellikler
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Bankerin gördüğü gibi görün
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Kredi kararlarını etkileyen her metrik, analist gözüyle yorumlanmış hâlde karşınızda.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`relative glass-card rounded-2xl p-6 overflow-hidden group hover:border-cyan-500/25 transition-all duration-300 hover:translate-y-[-3px]`}
            >
              {/* Arka plan gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />

              <div className="relative">
                {/* Tag */}
                <span className="inline-block text-[11px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1 mb-4 tracking-wide">
                  {f.tag}
                </span>

                <h3 className="text-white font-bold text-xl mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed mb-4">{f.description}</p>

                {/* Highlight chips */}
                <div className="flex flex-wrap gap-1.5">
                  {f.highlight.split(' · ').map((chip) => (
                    <span
                      key={chip}
                      className="text-[11px] text-white/40 bg-white/5 rounded-md px-2 py-0.5"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
