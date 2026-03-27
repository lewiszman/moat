import React, { useState } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useLocalStorage } from '../../hooks/useLocalStorage'

const NAV_ITEMS = [
  {
    id: 'manager',
    label: 'Manager View',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="5.5" height="5.5" rx=".75"/>
        <rect x="8.5" y="1" width="5.5" height="5.5" rx=".75"/>
        <rect x="1" y="8.5" width="5.5" height="5.5" rx=".75"/>
        <rect x="8.5" y="8.5" width="5.5" height="5.5" rx=".75"/>
      </svg>
    ),
  },
  {
    id: 'inspector',
    label: 'Pipeline Inspector',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.5" cy="6.5" r="4.5"/>
        <line x1="9.5" y1="9.5" x2="13.5" y2="13.5"/>
      </svg>
    ),
  },
  {
    id: 'dealback',
    label: 'Deal-Backing',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="3" height="9" rx=".75"/>
        <rect x="5.5" y="5" width="3" height="7" rx=".75"/>
        <rect x="10" y="1.5" width="3.5" height="10.5" rx=".75"/>
      </svg>
    ),
  },
]

const BOTTOM_ITEMS = [
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7.5" cy="7.5" r="2"/>
        <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.75 2.75l1.06 1.06M11.19 11.19l1.06 1.06M2.75 12.25l1.06-1.06M11.19 3.81l1.06-1.06"/>
      </svg>
    ),
  },
]

export default function Sidebar() {
  const activeView = useForecastStore(s => s.activeView)
  const setActiveView = useForecastStore(s => s.setActiveView)
  const [expanded, setExpanded] = useLocalStorage('rail_expanded', false)

  const NavItem = ({ item }) => {
    const isActive = activeView === item.id
    return (
      <button
        onClick={() => setActiveView(item.id)}
        title={!expanded ? item.label : undefined}
        className={`
          flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left
          transition-colors duration-100 cursor-pointer border-none
          ${isActive
            ? 'bg-[var(--blue)] text-white'
            : 'text-[var(--tx2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)]'
          }
        `}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {expanded && (
          <span className="text-[13px] font-[600] whitespace-nowrap overflow-hidden">
            {item.label}
            {item.badge && (
              <span className="ml-2 text-[9px] font-[700] bg-purple-100 text-purple-600 rounded px-1 py-px">
                {item.badge}
              </span>
            )}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav
      className={`
        flex flex-col flex-shrink-0 h-full bg-[var(--bg)] border-r border-[var(--bdr2)]
        transition-all duration-200
        ${expanded ? 'w-52' : 'w-14'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--bdr2)]">
        {expanded && (
          <span className="text-[13px] font-[800] tracking-tight text-[var(--tx)]">MOAT</span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded hover:bg-[var(--bg3)] text-[var(--tx2)] cursor-pointer border-none bg-transparent ml-auto"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="2" y1="12" x2="14" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Main nav */}
      <div className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
        {NAV_ITEMS.map(item => <NavItem key={item.id} item={item} />)}
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-1 p-2 border-t border-[var(--bdr2)]">
        {BOTTOM_ITEMS.map(item => <NavItem key={item.id} item={item} />)}
      </div>
    </nav>
  )
}
