'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold mb-3 text-[#0B3C5D]">
          Bir şeyler ters gitti
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-4">
            Hata kodu: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-[#0B3C5D] text-white rounded-md hover:bg-[#0a3354] transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
