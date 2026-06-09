import { useCallback, useEffect, useState } from 'react'

// Not in standard TS lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

const DISMISSED_KEY = 'job-book-install-dismissed'

function detectStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if ((navigator as { standalone?: boolean }).standalone === true) return true
  return false
}

function detectIosSafari(): boolean {
  const ua = navigator.userAgent
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  // Chrome/Firefox on iOS report Safari in UA — exclude them
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
  return isIos && isSafari
}

export interface UsePwaInstallReturn {
  showBanner: boolean
  isIosSafari: boolean
  triggerInstall: () => Promise<void>
  dismiss: () => void
}

export function usePwaInstall(): UsePwaInstallReturn {
  const [standalone] = useState(detectStandalone)
  const [iosSafari] = useState(detectIosSafari)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
  )
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const setOn = () => setOnline(true)
    const setOff = () => setOnline(false)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      window.removeEventListener('online', setOn)
      window.removeEventListener('offline', setOff)
    }
  }, [])

  useEffect(() => {
    if (standalone) return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [standalone])

  const showBanner = online && !standalone && !dismissed && (deferredPrompt !== null || iosSafari)

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setDeferredPrompt(null)
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }, [])

  return { showBanner, isIosSafari: iosSafari, triggerInstall, dismiss }
}
