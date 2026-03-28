import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg2)]">
        <div className="card max-w-md w-full mx-4 p-6 text-center">
          <div className="text-[32px] mb-3">⚠️</div>
          <div className="text-[15px] font-[700] text-[var(--tx)] mb-2">Something went wrong</div>
          <div className="text-[12px] text-[var(--tx2)] mb-4 font-mono break-all">
            {this.state.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary text-[12px]"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
