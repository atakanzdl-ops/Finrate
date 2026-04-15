'use client'

import React from 'react'
import { ChevronRight } from 'lucide-react'

interface RatioItem {
  label: string
  value: string
  avg: string
  status: 'positive' | 'warning' | 'negative'
}

interface RatiosTableProps {
  ratios: RatioItem[]
  title?: string
  subtitle?: string
}

export default function RatiosTable({ ratios, title, subtitle }: RatiosTableProps) {
  return (
    <div className="bg-white rounded-[32px] p-10 shadow-[0_32px_64px_-16px_rgba(11,60,93,0.08)] border border-slate-100 overflow-hidden">
      {(title || subtitle) && (
        <div className="mb-8 border-b border-slate-50 pb-8 flex items-end justify-between">
          <div>
            {title && <h3 className="text-xl font-black text-[#0B3C5D]">{title}</h3>}
            {subtitle && <p className="text-sm font-medium text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <button className="text-[#0B3C5D] text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 hover:gap-3 transition-all">
            TÜMÜNÜ İNCELE <ChevronRight size={14} />
          </button>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">GÖSTERGE ADI</th>
              <th className="pb-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">MEVCUT</th>
              <th className="pb-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">SEKTÖR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ratios.map((item, idx) => (
              <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                <td className="py-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full shadow-sm ${
                      item.status === 'positive' ? 'bg-[#2EC4B6]' : 
                      item.status === 'warning' ? 'bg-[#F59E0B]' : 
                      'bg-[#EF4444]'
                    }`} />
                    <span className="text-sm font-bold text-[#0B3C5D] group-hover:translate-x-1 transition-transform">{item.label}</span>
                  </div>
                </td>
                <td className="py-5 text-right font-display font-black text-[#0B3C5D]">{item.value}</td>
                <td className="py-5 text-right font-display font-bold text-slate-300">{item.avg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between">
        <div className="text-[10px] font-bold text-slate-300 italic font-mono uppercase tracking-tighter">
          * Verİler 2024/Q4 TCMB Sektör Ortalamaları İle kıyaslanmaktadır.
        </div>
      </div>
    </div>
  )
}
