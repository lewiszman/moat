import React, { useState, useRef, useEffect } from 'react'
import { useSectionComments } from '../../store/forecastStore'

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z"/>
    <line x1="7" y1="3" x2="9" y2="5"/>
  </svg>
)

export default function SectionComment({ sectionKey, placeholder = 'Add a note…' }) {
  const { comments, setComment, clearComment } = useSectionComments()
  const value = comments[sectionKey] || ''
  const [open, setOpen] = useState(!!value)
  const textareaRef = useRef(null)

  const hasNote = value.trim().length > 0

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleChange = (e) => {
    const v = e.target.value
    if (v.trim()) setComment(sectionKey, v)
    else clearComment(sectionKey)
  }

  return (
    <>
      {/* Pencil trigger button — rendered inline inside sec-hd by parent */}
      <button
        onClick={toggle}
        title={hasNote ? 'Edit note' : 'Add note'}
        className={`
          inline-flex items-center justify-center p-1 rounded
          border-none bg-transparent cursor-pointer transition-all duration-150
          ${hasNote
            ? 'text-[var(--blue)] opacity-80'
            : 'text-[var(--tx2)] opacity-40 hover:opacity-100 hover:text-[var(--blue)]'
          }
        `}
      >
        <PencilIcon />
      </button>

      {/* Textarea — shown below the sec-hd when open */}
      {open && (
        <div className="mb-3 -mt-0.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            rows={2}
            className={`
              w-full font-[var(--font)] text-[12px] text-[var(--tx)] bg-[var(--bg)]
              border border-[var(--bdr2)] rounded-[var(--rm)]
              px-3 py-2 resize-y min-h-[52px] max-h-40 outline-none leading-relaxed
              transition-colors duration-150
              focus:border-[var(--blue)]
              placeholder:text-[var(--tx2)] placeholder:opacity-60
            `}
          />
        </div>
      )}
    </>
  )
}
