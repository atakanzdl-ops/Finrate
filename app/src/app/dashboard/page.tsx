'use client'

import React, { useEffect } from 'react'

/**
 * Premium Dashboard Page - 1:1 Migration
 * Identical to the desktop references (index.html, style.css, app.js)
 * Applying 'bashka hiçbir shey yapmadan' (do nothing else) rule.
 */
export default function DashboardPage() {
  useEffect(() => {
    // ─── Tab Switching ───────────────────────────
    const tabs = document.querySelectorAll('.tab-group .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const parent = tab.closest('.tab-group');
            if (parent) {
                parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            }
            tab.classList.add('active');
            
            // Animate bars on tab change
            animateChartBars();
        });
    });

    // ─── Bar Tooltip on Hover ────────────────────
    const bars = document.querySelectorAll('.bar[data-tooltip]');
    bars.forEach(bar => {
        bar.addEventListener('mouseenter', (e) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'bar-tooltip';
            tooltip.textContent = (bar as HTMLElement).dataset.tooltip || '';
            tooltip.style.cssText = `
                position: absolute;
                top: -32px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(10, 23, 39, 0.92);
                color: #fff;
                padding: 5px 10px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
                pointer-events: none;
                z-index: 50;
                backdrop-filter: blur(8px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                animation: tooltipIn 0.2s ease-out;
            `;
            bar.appendChild(tooltip);
        });

        bar.addEventListener('mouseleave', () => {
            const tooltip = bar.querySelector('.bar-tooltip');
            if (tooltip) tooltip.remove();
        });
    });

    // ─── Animate Chart Bars Entrance ─────────────
    function animateChartBars() {
        const chartBars = document.querySelectorAll('.chart-canvas .bar') as NodeListOf<HTMLElement>;
        chartBars.forEach((bar, i) => {
            const originalHeight = bar.style.height;
            bar.style.height = '0%';
            bar.style.transition = 'none';
            
            requestAnimationFrame(() => {
                setTimeout(() => {
                    bar.style.transition = `height 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s`;
                    bar.style.height = originalHeight;
                }, 50);
            });
        });
    }

    // ─── Animate Ratio Bars ──────────────────────
    function animateRatioBars() {
        const ratioBars = document.querySelectorAll('.ratio-bar-fill') as NodeListOf<HTMLElement>;
        ratioBars.forEach((bar, i) => {
            const targetWidth = bar.style.width;
            bar.style.width = '0%';
            
            setTimeout(() => {
                bar.style.width = targetWidth;
            }, 300 + i * 100);
        });
    }

    // ─── Animate Score Ring ──────────────────────
    function animateScoreRing() {
        const ring = document.querySelector('.ring-fill');
        if (!ring) return;
        
        const targetOffset = ring.getAttribute('stroke-dashoffset');
        ring.setAttribute('stroke-dashoffset', '314.16');
        
        setTimeout(() => {
            ring.setAttribute('stroke-dashoffset', targetOffset || '0');
        }, 400);
    }

    // ─── Count-Up Animation ─────────────────────
    function animateCountUp(element: HTMLElement, target: number, suffix = '') {
        const duration = 1500;
        const start = 0;
        const startTime = performance.now();
        
        function update(currentTime: number) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (target - start) * eased);
            
            element.textContent = current + suffix;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        
        requestAnimationFrame(update);
    }

    // ─── Intersection Observer for scroll animations ─
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.card, .kpi-card').forEach(el => {
        observer.observe(el);
    });

    // ─── Nav link active state ──────────────────
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // ─── Initialize animations ──────────────────
    const initTimer = setTimeout(() => {
        animateScoreRing();
        animateRatioBars();
        animateChartBars();
        
        // Count up score
        const scoreEl = document.getElementById('score-number');
        if (scoreEl) animateCountUp(scoreEl, 742);
    }, 200);

    // ─── Tooltip animation css ────────
    const style = document.createElement('style');
    style.textContent = `
        @keyframes tooltipIn {
            from { opacity: 0; transform: translateX(-50%) translateY(4px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);

    return () => {
      clearTimeout(initTimer);
      style.remove();
    }
  }, []);

  return (
    <div className="app-shell">
        {/* Mesh Gradient Background Aura */}
        <div className="mesh-aura">
            <div className="aura-blob aura-1"></div>
            <div className="aura-blob aura-2"></div>
            <div className="aura-blob aura-3"></div>
        </div>

        {/* Subtle Dot Grid Overlay */}
        <div className="dot-grid"></div>

        {/* ═══════════════════ TOP NAVBAR ═══════════════════ */}
        <header className="topbar" id="topbar">
            <div className="topbar-inner">
                <div className="brand">
                    <div className="brand-icon">
                        <span>F</span>
                    </div>
                    <span className="brand-name">Finrate</span>
                </div>
                <nav className="topnav" id="topnav">
                    <a href="#" className="nav-link active" id="nav-dashboard">Dashboard</a>
                    <a href="#" className="nav-link" id="nav-reports">Raporlar</a>
                    <a href="#" className="nav-link" id="nav-analysis">Analiz</a>
                    <a href="#" className="nav-link" id="nav-settings">Ayarlar</a>
                </nav>
                <div className="topbar-actions">
                    <button className="btn-icon" id="btn-search" aria-label="Ara">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </button>
                    <button className="btn-icon" id="btn-notifications" aria-label="Bildirimler">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span className="notif-dot"></span>
                    </button>
                    <div className="user-avatar" id="user-avatar">
                        <span>AÖ</span>
                    </div>
                </div>
            </div>
        </header>

        {/* ═══════════════════ MAIN DASHBOARD ═══════════════════ */}
        <main className="dashboard" id="dashboard">
            {/* Page Header */}
            <div className="page-header">
                <div className="page-header-left">
                    <h1 id="page-title">Finansal Genel Bakış</h1>
                    <p className="page-subtitle">Son güncelleme: 3 Nisan 2026 · Dönem: 2025/Q4</p>
                </div>
                <div className="page-header-right">
                    <button className="btn btn-secondary" id="btn-export">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Rapor İndir
                    </button>
                    <button className="btn btn-primary" id="btn-new-analysis">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Yeni Analiz
                    </button>
                </div>
            </div>

            {/* ═══════ KPI CARDS ROW ═══════ */}
            <section className="kpi-row" id="kpi-section">
                {/* KPI 1: Finrate Skoru */}
                <div className="kpi-card kpi-score" id="kpi-score">
                    <div className="kpi-header">
                        <span className="kpi-label">Finrate Skoru</span>
                        <span className="kpi-badge badge-up">+12 puan</span>
                    </div>
                    <div className="kpi-body-score">
                        <div className="score-ring-wrap">
                            <svg className="score-ring" viewBox="0 0 120 120">
                                <defs>
                                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#2dd4bf"/>
                                        <stop offset="100%" stopColor="#14b8a6"/>
                                    </linearGradient>
                                </defs>
                                <circle className="ring-bg" cx="60" cy="60" r="50"/>
                                <circle className="ring-fill" cx="60" cy="60" r="50" 
                                    stroke="url(#scoreGrad)"
                                    strokeDasharray="314.16"
                                    strokeDashoffset="62.83"/>
                            </svg>
                            <div className="score-value">
                                <span className="score-num" id="score-number">742</span>
                                <span className="score-max">/1000</span>
                            </div>
                        </div>
                        <div className="score-meta">
                            <span className="score-grade">AA+</span>
                            <span className="score-label">Yüksek Kredi Notu</span>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Aktif Toplam */}
                <div className="kpi-card" id="kpi-aktif">
                    <div className="kpi-header">
                        <span className="kpi-label">Aktif Toplam</span>
                        <span className="kpi-badge badge-up">+18.2%</span>
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-value">₺14.8M</span>
                        <div className="kpi-sparkline" id="spark-aktif">
                            <svg viewBox="0 0 80 30" preserveAspectRatio="none">
                                <polyline points="0,25 10,22 20,18 30,20 40,15 50,12 60,8 70,5 80,3" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                                <polyline points="0,25 10,22 20,18 30,20 40,15 50,12 60,8 70,5 80,3 80,30 0,30" fill="url(#sparkGrad1)" opacity="0.15"/>
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-footer">
                        <span>Önceki dönem: ₺12.5M</span>
                    </div>
                </div>

                {/* KPI 3: Cari Oran */}
                <div className="kpi-card" id="kpi-cari">
                    <div className="kpi-header">
                        <span className="kpi-label">Cari Oran</span>
                        <span className="kpi-badge badge-up">+0.3</span>
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-value">1.85</span>
                        <div className="kpi-bar-wrap">
                            <div className="kpi-bar">
                                <div className="kpi-bar-fill" style={{ width: '74%' }}></div>
                                <div className="kpi-bar-marker" style={{ left: '50%' }}></div>
                            </div>
                            <div className="kpi-bar-labels">
                                <span>Düşük</span>
                                <span>Hedef</span>
                                <span>Yüksek</span>
                            </div>
                        </div>
                    </div>
                    <div className="kpi-footer">
                        <span>Sektör ort: 1.42</span>
                    </div>
                </div>

                {/* KPI 4: Borç/Özkaynak */}
                <div className="kpi-card" id="kpi-borc">
                    <div className="kpi-header">
                        <span className="kpi-label">Borç / Özkaynak</span>
                        <span className="kpi-badge badge-down">-0.15</span>
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-value">0.62</span>
                        <div className="kpi-sparkline" id="spark-borc">
                            <svg viewBox="0 0 80 30" preserveAspectRatio="none">
                                <polyline points="0,8 10,10 20,15 30,12 40,18 50,20 60,22 70,24 80,25" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                    </div>
                    <div className="kpi-footer">
                        <span>Sektör ort: 0.95</span>
                    </div>
                </div>
            </section>

            {/* ═══════ MAIN CONTENT GRID ═══════ */}
            <section className="content-grid" id="content-grid">
                {/* LEFT: Revenue & Performance Chart */}
                <div className="card card-chart" id="card-chart">
                    <div className="card-head">
                        <div className="card-head-left">
                            <h2 className="card-title">Gelir & Performans Analizi</h2>
                            <p className="card-desc">4 Dönemlik mukayeseli trend</p>
                        </div>
                        <div className="card-head-right">
                            <div className="tab-group" id="chart-tabs">
                                <button className="tab active" data-tab="gelir">Gelir</button>
                                <button className="tab" data-tab="kar">Kâr</button>
                                <button className="tab" data-tab="nakit">Nakit</button>
                            </div>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="chart-area" id="main-chart">
                            {/* Y Axis */}
                            <div className="chart-y-axis">
                                <span>₺15M</span>
                                <span>₺12M</span>
                                <span>₺9M</span>
                                <span>₺6M</span>
                                <span>₺3M</span>
                                <span>₺0</span>
                            </div>
                            {/* Chart Canvas */}
                            <div className="chart-canvas">
                                {/* Grid lines */}
                                <div className="chart-grid-line" style={{ bottom: '100%' }}></div>
                                <div className="chart-grid-line" style={{ bottom: '80%' }}></div>
                                <div className="chart-grid-line" style={{ bottom: '60%' }}></div>
                                <div className="chart-grid-line" style={{ bottom: '40%' }}></div>
                                <div className="chart-grid-line" style={{ bottom: '20%' }}></div>
                                <div className="chart-grid-line" style={{ bottom: '0%' }}></div>

                                {/* Bar Groups */}
                                <div className="bar-group">
                                    <div className="bar-pair">
                                        <div className="bar bar-primary" style={{ height: '45%' }} data-tooltip="₺6.7M">
                                            <div className="bar-glow"></div>
                                        </div>
                                        <div className="bar bar-secondary" style={{ height: '35%' }} data-tooltip="₺5.2M"></div>
                                    </div>
                                    <span className="bar-label">2022/Q4</span>
                                </div>
                                <div className="bar-group">
                                    <div className="bar-pair">
                                        <div className="bar bar-primary" style={{ height: '55%' }} data-tooltip="₺8.2M">
                                            <div className="bar-glow"></div>
                                        </div>
                                        <div className="bar bar-secondary" style={{ height: '42%' }} data-tooltip="₺6.3M"></div>
                                    </div>
                                    <span class="bar-label">2023/Q4</span>
                                </div>
                                <div className="bar-group">
                                    <div className="bar-pair">
                                        <div className="bar bar-primary" style={{ height: '68%' }} data-tooltip="₺10.2M">
                                            <div className="bar-glow"></div>
                                        </div>
                                        <div className="bar bar-secondary" style={{ height: '55%' }} data-tooltip="₺8.2M"></div>
                                    </div>
                                    <span className="bar-label">2024/Q4</span>
                                </div>
                                <div className="bar-group active-period">
                                    <div className="bar-pair">
                                        <div className="bar bar-primary" style={{ height: '88%' }} data-tooltip="₺13.2M">
                                            <div className="bar-glow"></div>
                                        </div>
                                        <div className="bar bar-secondary" style={{ height: '72%' }} data-tooltip="₺10.8M"></div>
                                    </div>
                                    <span className="bar-label">2025/Q4</span>
                                </div>

                                {/* Trend Line Overlay */}
                                <svg className="trend-overlay" viewBox="0 0 400 200" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.2"/>
                                            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0"/>
                                        </linearGradient>
                                    </defs>
                                    <path id="trendPath" d="M50,150 C100,140 150,120 200,100 C250,80 300,50 350,30" fill="none" stroke="#2dd4bf" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
                                    <path d="M50,150 C100,140 150,120 200,100 C250,80 300,50 350,30 L350,200 L50,200 Z" fill="url(#trendGrad)"/>
                                    {/* Animated tracker dot */}
                                    <circle r="5" fill="#2dd4bf" filter="url(#glow)">
                                        <animateMotion dur="5s" repeatCount="indefinite" path="M50,150 C100,140 150,120 200,100 C250,80 300,50 350,30"/>
                                        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="5s" repeatCount="indefinite"/>
                                    </circle>
                                    <defs>
                                        <filter id="glow">
                                            <feGaussianBlur stdDeviation="3" result="blur"/>
                                            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                        </filter>
                                    </defs>
                                </svg>
                            </div>
                        </div>
                        {/* Chart Legend */}
                        <div className="chart-legend">
                            <div className="legend-item">
                                <span className="legend-dot dot-primary"></span>
                                <span>Brüt Gelir</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-dot dot-secondary"></span>
                                <span>Net Gelir</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-dot dot-trend"></span>
                                <span>Trend</span>
                            </div>
                            <div className="chart-summary">
                                <span className="summary-label">Son Dönem:</span>
                                <span className="summary-value">₺13.2M</span>
                                <span className="summary-change up">+29.4%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDEBAR */}
                <div className="sidebar-stack">
                    {/* Credit Rating Card */}
                    <div className="card card-rating" id="card-rating">
                        <div className="card-head">
                            <h2 className="card-title">Kredi Derecelendirme</h2>
                        </div>
                        <div className="card-body">
                            <div className="rating-scale" id="rating-scale">
                                <div className="rating-pill" data-rating="AAA">AAA</div>
                                <div className="rating-pill active" data-rating="AA">AA+</div>
                                <div className="rating-pill" data-rating="A">A</div>
                                <div className="rating-pill" data-rating="BBB">BBB</div>
                                <div className="rating-pill" data-rating="BB">BB</div>
                                <div className="rating-pill" data-rating="B">B</div>
                                <div className="rating-pill" data-rating="CCC">CCC</div>
                            </div>
                            <div className="rating-info">
                                <div className="rating-detail">
                                    <span className="rating-detail-label">Risk Seviyesi</span>
                                    <span className="rating-detail-value low">Düşük</span>
                                </div>
                                <div className="rating-detail">
                                    <span className="rating-detail-label">Sektör Sıralaması</span>
                                    <span className="rating-detail-value">Top %15</span>
                                </div>
                                <div className="rating-detail">
                                    <span className="rating-detail-label">Önceki Dönem</span>
                                    <span className="rating-detail-value">AA</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Ratio Breakdown Card */}
                    <div className="card card-ratios" id="card-ratios">
                        <div className="card-head">
                            <h2 className="card-title">Finansal Oran Dağılımı</h2>
                        </div>
                        <div className="card-body">
                            <div className="ratio-list">
                                <div className="ratio-row">
                                    <span className="ratio-name">Likidite</span>
                                    <div className="ratio-bar-track">
                                        <div className="ratio-bar-fill fill-cyan" style={{ width: '82%' }}></div>
                                    </div>
                                    <span className="ratio-pct">82%</span>
                                </div>
                                <div className="ratio-row">
                                    <span className="ratio-name">Kârlılık</span>
                                    <div className="ratio-bar-track">
                                        <div className="ratio-bar-fill fill-blue" style={{ width: '74%' }}></div>
                                    </div>
                                    <span className="ratio-pct">74%</span>
                                </div>
                                <div className="ratio-row">
                                    <span className="ratio-name">Verimlilik</span>
                                    <div className="ratio-bar-track">
                                        <div className="ratio-bar-fill fill-indigo" style={{ width: '68%' }}></div>
                                    </div>
                                    <span className="ratio-pct">68%</span>
                                </div>
                                <div className="ratio-row">
                                    <span className="ratio-name">Borçluluk</span>
                                    <div className="ratio-bar-track">
                                        <div className="ratio-bar-fill fill-emerald" style={{ width: '88%' }}></div>
                                    </div>
                                    <span className="ratio-pct">88%</span>
                                </div>
                                <div className="ratio-row">
                                    <span className="ratio-name">Büyüme</span>
                                    <div className="ratio-bar-track">
                                        <div className="ratio-bar-fill fill-teal" style={{ width: '71%' }}></div>
                                    </div>
                                    <span className="ratio-pct">71%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════ BOTTOM SECTION: TABLE + DONUT ═══════ */}
            <section className="bottom-grid" id="bottom-grid">
                {/* Financial Indicators Table */}
                <div className="card card-table" id="card-table">
                    <div className="card-head">
                        <div className="card-head-left">
                            <h2 className="card-title">25 Temel Gösterge</h2>
                            <p className="card-desc">Detaylı finansal sağlık metrikleri</p>
                        </div>
                        <div className="card-head-right">
                            <button className="btn-text" id="btn-show-all">Tümünü Gör →</button>
                        </div>
                    </div>
                    <div className="card-body">
                        <table className="fin-table" id="fin-table">
                            <thead>
                                <tr>
                                    <th>Gösterge</th>
                                    <th>Değer</th>
                                    <th>Sektör Ort.</th>
                                    <th>Durum</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">📊</span>
                                        Cari Oran
                                    </td>
                                    <td className="indicator-val">1.85</td>
                                    <td className="indicator-avg">1.42</td>
                                    <td><span className="status-chip status-good">İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">💰</span>
                                        Likidite Oranı
                                    </td>
                                    <td className="indicator-val">1.23</td>
                                    <td className="indicator-avg">0.95</td>
                                    <td><span className="status-chip status-good">İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">📈</span>
                                        Net Kâr Marjı
                                    </td>
                                    <td className="indicator-val">%12.4</td>
                                    <td className="indicator-avg">%8.7</td>
                                    <td><span className="status-chip status-great">Çok İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">🏦</span>
                                        Borç/Özkaynak
                                    </td>
                                    <td className="indicator-val">0.62</td>
                                    <td className="indicator-avg">0.95</td>
                                    <td><span className="status-chip status-great">Çok İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">⚡</span>
                                        Aktif Devir Hızı
                                    </td>
                                    <td className="indicator-val">2.15</td>
                                    <td className="indicator-avg">1.80</td>
                                    <td><span className="status-chip status-good">İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">📉</span>
                                        Faiz Karşılama
                                    </td>
                                    <td className="indicator-val">4.82</td>
                                    <td className="indicator-avg">3.10</td>
                                    <td><span className="status-chip status-great">Çok İyi</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">🔄</span>
                                        Stok Devir Hızı
                                    </td>
                                    <td className="indicator-val">5.30</td>
                                    <td className="indicator-avg">6.20</td>
                                    <td><span className="status-chip status-warn">Orta</span></td>
                                </tr>
                                <tr>
                                    <td className="indicator-name">
                                        <span className="indicator-icon">💳</span>
                                        Alacak Tahsil Süresi
                                    </td>
                                    <td className="indicator-val">42 gün</td>
                                    <td className="indicator-avg">55 gün</td>
                                    <td><span className="status-chip status-good">İyi</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Asset Composition Donut */}
                <div className="card card-donut" id="card-donut">
                    <div className="card-head">
                        <h2 className="card-title">Aktif Dağılımı</h2>
                    </div>
                    <div className="card-body">
                        <div className="donut-wrap">
                            <svg className="donut-chart" viewBox="0 0 160 160">
                                <defs>
                                    <linearGradient id="dg1" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#0d3b66"/>
                                        <stop offset="100%" stopColor="#1a5276"/>
                                    </linearGradient>
                                    <linearGradient id="dg2" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#2dd4bf"/>
                                        <stop offset="100%" stopColor="#14b8a6"/>
                                    </linearGradient>
                                    <linearGradient id="dg3" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#6366f1"/>
                                        <stop offset="100%" stopColor="#818cf8"/>
                                    </linearGradient>
                                    <linearGradient id="dg4" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#0ea5e9"/>
                                        <stop offset="100%" stopColor="#38bdf8"/>
                                    </linearGradient>
                                </defs>
                                {/* Segments */}
                                <circle className="donut-seg" cx="80" cy="80" r="60" stroke="url(#dg1)"
                                    strokeDasharray="138.23 239.38" strokeDashoffset="0" transform="rotate(-90 80 80)"/>
                                <circle className="donut-seg" cx="80" cy="80" r="60" stroke="url(#dg2)"
                                    strokeDasharray="94.25 283.36" strokeDashoffset="-138.23" transform="rotate(-90 80 80)"/>
                                <circle className="donut-seg" cx="80" cy="80" r="60" stroke="url(#dg3)"
                                    strokeDasharray="60.32 317.29" strokeDashoffset="-232.48" transform="rotate(-90 80 80)"/>
                                <circle className="donut-seg" cx="80" cy="80" r="60" stroke="url(#dg4)"
                                    strokeDasharray="84.82 292.79" strokeDashoffset="-292.80" transform="rotate(-90 80 80)"/>
                            </svg>
                            <div className="donut-center">
                                <span className="donut-total">₺14.8M</span>
                                <span className="donut-label">Toplam Aktif</span>
                            </div>
                        </div>
                        <div className="donut-legend">
                            <div className="donut-legend-item">
                                <span className="legend-color" style={{ background: '#0d3b66' }}></span>
                                <span className="legend-text">Duran Varlıklar</span>
                                <span className="legend-val">%36.7</span>
                            </div>
                            <div className="donut-legend-item">
                                <span className="legend-color" style={{ background: '#2dd4bf' }}></span>
                                <span className="legend-text">Dönen Varlıklar</span>
                                <span className="legend-val">%25.0</span>
                            </div>
                            <div className="donut-legend-item">
                                <span className="legend-color" style={{ background: '#6366f1' }}></span>
                                <span className="legend-text">Nakit & Benzerleri</span>
                                <span className="legend-val">%16.0</span>
                            </div>
                            <div className="donut-legend-item">
                                <span className="legend-color" style={{ background: '#0ea5e9' }}></span>
                                <span className="legend-text">Ticari Alacaklar</span>
                                <span className="legend-val">%22.3</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>
  )
}
