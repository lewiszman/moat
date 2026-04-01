import React from 'react'

// Lightweight CSS-only tooltip. Wraps a trigger element and shows
// a panel above it on hover/focus. pointer-events-none on the panel
// means it never interferes with surrounding UI.
export default function Tooltip({ title, body, children }) {
  return (
    <span className="relative inline-flex items-center group">
      {children}
      <span
        className="
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          w-[280px] p-3 rounded-lg border border-[var(--bdr2)]
          bg-[var(--bg)] shadow-lg text-left z-[9999]
          pointer-events-none
          opacity-0 scale-95
          group-hover:opacity-100 group-hover:scale-100
          transition-all duration-150 origin-bottom
        "
      >
        {title && (
          <span className="block text-[11px] font-[700] text-[var(--tx)] mb-1">{title}</span>
        )}
        {body && (
          <span className="block text-[11px] text-[var(--tx2)] leading-relaxed">{body}</span>
        )}
      </span>
    </span>
  )
}
