'use client'

import { Mark } from './Logo'

/** While the database worker starts and opens storage. */
export function Splash({ status = 'Opening your memory…', children }: { status?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Mark className="h-12 w-12" />
      <div>
        <p role="status" aria-live="polite" className="text-[17px] font-semibold">
          {status}
        </p>
        <p className="muted mt-1.5 text-[14px]">Your memories. Your device. Your privacy.</p>
      </div>
      {children}
    </div>
  )
}

/**
 * Startup failed. Says what probably happened and offers a retry — and never
 * offers to "reset" anything, because clearing someone's data is not a fix.
 */
export function StartupError({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md p-6" role="alert">
        <Mark className="h-10 w-10" />
        <h1 className="mt-4 text-[20px] md:text-[22px]">{title}</h1>
        <p className="muted mt-2 text-[14px] leading-relaxed">
          Keepsake keeps everything in this browser’s storage, and the browser did not allow it.
          This usually means site data is blocked, the browser is in a private mode that limits
          storage, or the browser is too old for the database to run.
        </p>
        <p
          className="mt-3 rounded-[10px] px-3 py-2 font-mono text-[12px] break-words"
          style={{ background: 'var(--color-fill)' }}
        >
          {message}
        </p>
        <p className="muted mt-3 text-[13px]">Nothing was deleted. Anything already saved is still on this device.</p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-5 w-full">
          Try again
        </button>
      </div>
    </div>
  )
}
