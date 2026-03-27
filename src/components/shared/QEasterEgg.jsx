import React, { useState, useEffect, useRef } from 'react'

// ── Confetti piece ──────────────────────────────────────────────
const COLORS = ['#1a56db','#E85D3A','#0d7c3d','#b45309','#7c3aed','#dc2626','#f59e0b','#10b981']
const SHAPES = ['■', '●', '▲', '◆', '★']

function ConfettiPiece({ style, char }) {
  return (
    <span
      className="pointer-events-none absolute text-[14px] font-bold select-none"
      style={style}
    >
      {char}
    </span>
  )
}

function Confetti() {
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    const newPieces = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left:      Math.random() * 100 + '%',
      color:     COLORS[Math.floor(Math.random() * COLORS.length)],
      char:      SHAPES[Math.floor(Math.random() * SHAPES.length)],
      delay:     Math.random() * 2,
      duration:  2.5 + Math.random() * 2.5,
      size:      10 + Math.floor(Math.random() * 10),
    }))
    setPieces(newPieces)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-[9998]">
      {pieces.map(p => (
        <ConfettiPiece
          key={p.id}
          char={p.char}
          style={{
            left: p.left,
            top: '-20px',
            color: p.color,
            fontSize: p.size,
            animation: `qe-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}

// ── Ticker tape ─────────────────────────────────────────────────
const MESSAGES = [
  '🎉 QUARTER CLOSED!', '🔥 QUOTA CRUSHED!', '💰 MONEY IN THE BANK',
  '🏆 TEAM WINS!', '🚀 LET\'S GO!', '🎯 NAILED IT!',
  '💪 BEAST MODE!', '⚡ LIGHTNING QUARTER!',
]

function TickerTape() {
  const msg = MESSAGES.join('   ···   ')
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] overflow-hidden"
      style={{ height: 36, background: 'linear-gradient(90deg, #1a1a2e, #E85D3A, #1a1a2e)', borderBottom: '2px solid #E85D3A' }}
    >
      <div
        className="whitespace-nowrap text-white font-[800] text-[13px] tracking-wide"
        style={{
          display: 'inline-block',
          paddingTop: 8,
          animation: 'qe-ticker 18s linear infinite',
        }}
      >
        {msg}   ···   {msg}
      </div>
    </div>
  )
}

// ── Flame row ──────────────────────────────────────────────────
function Flames() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9998] flex justify-around pointer-events-none"
      style={{ height: 80 }}
    >
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="text-[32px] select-none"
          style={{
            animation: `qe-flame ${0.8 + Math.random() * 0.6}s ease-in-out ${Math.random() * 0.5}s infinite alternate`,
            display: 'inline-block',
            originX: 'center',
          }}
        >
          🔥
        </span>
      ))}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────
function QEModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none"
      style={{ top: 36 }}
    >
      <div
        className="pointer-events-auto text-center px-10 py-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: '2px solid #E85D3A',
          color: '#fff',
        }}
      >
        <div className="text-[56px] mb-2">🏆</div>
        <div className="text-[22px] font-[800] mb-1" style={{ color: '#E85D3A' }}>
          Q-END MODE
        </div>
        <div className="text-[14px] text-white/80 mb-4">
          The quarter is closing. Every deal counts. Go get it.
        </div>
        <div className="text-[32px] mb-4">🔥 🚀 💰</div>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-lg text-[13px] font-[700] cursor-pointer border-none"
          style={{ background: '#E85D3A', color: '#fff' }}
        >
          Back to work →
        </button>
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────
export default function QEasterEgg({ onClose }) {
  const [showConfetti, setShowConfetti] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 5000)
    return () => clearTimeout(t)
  }, [])

  // ESC to dismiss
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <TickerTape />
      {showConfetti && <Confetti />}
      <Flames />
      <QEModal onClose={onClose} />
    </>
  )
}
