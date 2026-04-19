'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print px-4 py-2 bg-gray-900 text-white rounded text-sm"
    >
      印刷 / PDF保存
    </button>
  )
}
