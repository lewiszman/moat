import React, { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'

function fmt(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Group sessions by quarter_label
function groupByQuarter(sessions) {
  const map = {}
  for (const s of sessions) {
    const q = s.quarter_label || 'Unknown'
    if (!map[q]) map[q] = []
    map[q].push(s)
  }
  return Object.entries(map) // [['Q2 FY26', [...]], ...]
}

export default function SessionHistory() {
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const panelRef = useRef(null)

  const sessions        = useSessionStore(s => s.sessions)
  const loadingSessions = useSessionStore(s => s.loadingSessions)
  const restoreSession  = useSessionStore(s => s.restoreSession)
  const deleteSession   = useSessionStore(s => s.deleteSession)
  const loadSessions    = useSessionStore(s => s.loadSessions)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleRestore = async (id) => {
    setRestoring(id)
    await restoreSession(id)
    setRestoring(null)
    setOpen(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    await deleteSession(id)
  }

  const grouped = groupByQuarter(sessions)

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) loadSessions() }}
        className="btn text-[11px] flex items-center gap-1"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        History
        {sessions.length > 0 && (
          <span className="ml-0.5 px-1 py-0 rounded bg-[var(--blue)] text-white text-[10px] leading-tight">
            {sessions.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-[var(--bdr2)] bg-[var(--bg)] shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--bdr2)] flex items-center justify-between">
            <span className="text-[12px] font-[600] text-[var(--tx)]">Session History</span>
            {loadingSessions && (
              <span className="text-[10px] text-[var(--tx2)]">Loading...</span>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {sessions.length === 0 && !loadingSessions && (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--tx2)]">
                No saved sessions yet.<br/>Auto-saves will appear here as you work.
              </div>
            )}

            {grouped.map(([quarter, rows]) => (
              <div key={quarter}>
                <div className="px-3 py-1.5 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
                  <span className="text-[10px] font-[700] tracking-wider text-[var(--tx2)] uppercase">{quarter}</span>
                </div>
                {rows.map(session => (
                  <div
                    key={session.id}
                    className="flex items-center gap-2 px-3 py-2 border-b border-[var(--bdr2)] hover:bg-[var(--bg2)] group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1 rounded font-[600] ${
                          session.is_auto
                            ? 'bg-[var(--bg3)] text-[var(--tx2)]'
                            : 'bg-[var(--blue)] text-white'
                        }`}>
                          {session.is_auto ? 'Auto' : 'Saved'}
                        </span>
                        <span className="text-[11px] text-[var(--tx)] truncate">
                          {session.label || fmt(session.updated_at)}
                        </span>
                      </div>
                      {session.label && (
                        <div className="text-[10px] text-[var(--tx2)] mt-0.5">
                          {fmt(session.updated_at)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRestore(session.id)}
                        disabled={restoring === session.id}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--blue)] text-white hover:opacity-80 disabled:opacity-50"
                      >
                        {restoring === session.id ? '...' : 'Restore'}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="text-[11px] px-1.5 py-0.5 rounded text-[var(--coral)] hover:bg-[var(--bg3)]"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
