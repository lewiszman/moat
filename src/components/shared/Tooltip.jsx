import React, { useState, useRef } from 'react'

// Fixed-position tooltip — renders outside all overflow/clip ancestors.
// Position is calculated from the trigger's bounding rect on mouseenter.
export default function Tooltip({ title, body, children }) {
  const wrapRef = useRef(null)
  const [pos, setPos] = useState(null)

  const show = () => {
    if (!wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setPos({ top: r.top, cx: r.left + r.width / 2 })
  }

  const hide = () => setPos(null)

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {pos && (
        <span
          style={{
            position: 'fixed',
            top:  pos.top - 8,
            left: pos.cx,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
          className="w-[280px] p-3 rounded-lg border border-[var(--bdr2)] bg-[var(--bg)] shadow-lg text-left pointer-events-none"
        >
          {title && (
            <span className="block text-[11px] font-[700] text-[var(--tx)] mb-1">{title}</span>
          )}
          {body && (
            <span className="block text-[11px] text-[var(--tx2)] leading-relaxed">{body}</span>
          )}
        </span>
      )}
    </span>
  )
}
