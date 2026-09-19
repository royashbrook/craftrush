import { base as basePath } from '$app/paths'
import { UPDATE_SUPPORT_ACK, UPDATE_SUPPORT_QUERY } from '../../js/pwa-safety.ts'

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'offline' | 'failed' | 'unavailable' | 'applying' | 'unsaved'
export interface UpdateState { status: UpdateStatus; ready: boolean }

export function startUpdates(publish: (state: UpdateState) => void, beforeUpdate: () => boolean) {
  const lifetime = new AbortController()
  const channels = new Set<() => void>()
  const base = new URL(`${basePath}/`, location.href)
  const state: UpdateState = { status: 'idle', ready: false }
  let registration: ServiceWorkerRegistration | undefined
  let candidate: ServiceWorker | null = null
  let checking = false
  let checkAgain = false
  let interval: ReturnType<typeof setInterval> | undefined
  let activating: ServiceWorker | null = null
  let activationTimer: ReturnType<typeof setTimeout> | undefined
  const disposed = () => lifetime.signal.aborted
  const set = (status: UpdateStatus, ready = state.ready) => {
    if (state.status === 'applying' && status !== 'applying') return
    if (!disposed()) { Object.assign(state, { status, ready }); publish({ ...state }) }
  }
  const clearActivation = () => {
    activating = null
    clearTimeout(activationTimer)
    activationTimer = undefined
  }
  const failActivation = () => {
    clearActivation()
    candidate = null
    if (state.status === 'applying') state.status = 'failed'
    set('failed', false)
  }
  const activate = (worker: ServiceWorker) => {
    activating = worker
    // Bound an ignored activation request without probing the outgoing worker.
    activationTimer = setTimeout(() => {
      if (!disposed() && activating === worker) failActivation()
    }, 8000)
    try { worker.postMessage({ type: 'CRAFTRUSH_ACTIVATE' }) } catch { failActivation() }
  }
  const identify = (worker: ServiceWorker | null) => new Promise<string | null>(resolve => {
    if (!worker || disposed()) return resolve(null)
    const channel = new MessageChannel()
    const close = () => {
      clearTimeout(timeout)
      channel.port1.close()
      channel.port2.close()
      channels.delete(close)
      resolve(null)
    }
    const timeout = setTimeout(close, 4000)
    channels.add(close)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      resolve(typeof event.data === 'string' && /^[a-f0-9]{64}$/.test(event.data) ? event.data : null)
      close()
    }
    try { worker.postMessage({ type: 'CRAFTRUSH_VERSION' }, [channel.port2]) } catch { close() }
  })
  const refresh = async (value: ServiceWorkerRegistration) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel = () => {}
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Worker update timed out')), 8000)
      cancel = () => reject(lifetime.signal.reason)
      lifetime.signal.addEventListener('abort', cancel, { once: true })
    })
    try {
      // Native update has no AbortSignal. Stop waiting, not the browser's job;
      // a later installation is still discovered by its normal state events.
      await Promise.race([value.update(), deadline])
    } finally {
      clearTimeout(timer)
      lifetime.signal.removeEventListener('abort', cancel)
    }
  }

  async function check() {
    if (disposed() || !registration || document.hidden || activating || state.status === 'applying') return
    if (checking) { checkAgain = true; return }
    checking = true
    set('checking')
    try {
      const response = await fetch(new URL('release.json?update-probe', base), {
        cache: 'no-store', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]),
      })
      if (!response.ok) throw new Error(`Update check: ${response.status}`)
      const identity: unknown = await response.json()
      if (disposed() || activating) return
      if (!identity || typeof identity !== 'object' || !('fingerprint' in identity) ||
        typeof identity.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(identity.fingerprint)) throw new Error('Invalid update identity')
      let target = registration.waiting
      let fingerprint = await identify(target)
      if (disposed() || activating) return
      // Reuse a verified download; installation events recheck unfinished work.
      if (!registration.installing && fingerprint !== identity.fingerprint) {
        try { await refresh(registration) } catch { set('failed', false); return }
        if (disposed() || activating) return
        target = registration.waiting ?? registration.active
        fingerprint = await identify(target)
      }
      if (disposed() || activating) return
      if (fingerprint === __RELEASE__.fingerprint) {
        // The legacy network-first worker can serve the new page before its
        // replacement activates. This page already runs that downloaded build.
        if (target && registration.waiting === target) {
          // Keep new probes off the outgoing legacy worker during this handoff.
          // Stay quiet until controllerchange, redundancy or the recovery deadline.
          candidate = null
          set('checking', false)
          activate(target)
          return
        }
        else navigator.serviceWorker.controller?.postMessage({ type: 'CRAFTRUSH_CLIENT', fingerprint })
      }
      if (fingerprint === identity.fingerprint && fingerprint !== __RELEASE__.fingerprint) {
        candidate = target
        set('ready', true)
      } else {
        candidate = null
        set(registration.installing ? 'downloading' : identity.fingerprint === __RELEASE__.fingerprint ? 'current' : 'failed', false)
      }
    } catch {
      set('offline')
    } finally {
      checking = false
      if (checkAgain) { checkAgain = false; void check() }
    }
  }

  const changed = () => {
    clearActivation()
    if (state.status === 'applying' && !disposed()) location.reload()
    else void check()
  }
  const watch = (worker: ServiceWorker | null) => worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed' || worker.state === 'activated') void check()
    if (worker.state === 'redundant' && !disposed()) {
      if (activating) {
        if (worker === activating) failActivation()
        return
      }
      if (worker === candidate) {
        // A newer download can replace the selected waiting worker before it
        // handles activation. This is a real failure, not a stale check result.
        failActivation()
      } else if (!candidate) set('failed', false)
    }
  }, { signal: lifetime.signal })
  const visible = () => { if (!document.hidden) void check() }

  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.addEventListener('controllerchange', changed, { signal: lifetime.signal })
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === UPDATE_SUPPORT_QUERY) event.ports[0]?.postMessage({ type: UPDATE_SUPPORT_ACK })
    }, { signal: lifetime.signal })
    addEventListener('focus', visible, { signal: lifetime.signal })
    document.addEventListener('visibilitychange', visible, { signal: lifetime.signal })
    addEventListener('pageshow', visible, { signal: lifetime.signal })
    addEventListener('online', visible, { signal: lifetime.signal })
    void navigator.serviceWorker.register(new URL('service-worker.js', base), { type: 'module', updateViaCache: 'none' }).then(value => {
      if (disposed()) return
      registration = value
      watch(value.installing)
      watch(value.waiting)
      value.addEventListener('updatefound', () => watch(value.installing), { signal: lifetime.signal })
      interval = setInterval(visible, 300000)
      void check()
    }).catch(() => set('unavailable'))
  }

  return {
    check,
    apply() {
      if (disposed() || activating || !state.ready || !candidate || state.status === 'applying') return
      if (!beforeUpdate()) { set('unsaved'); return }
      if (candidate.state === 'installed' && candidate === registration?.waiting) {
        set('applying')
        activate(candidate)
      } else if (candidate.state === 'activated' && candidate === navigator.serviceWorker.controller) {
        set('applying')
        location.reload()
      } else void check()
    },
    dispose() {
      lifetime.abort()
      clearActivation()
      clearInterval(interval)
      for (const close of channels) close()
    },
  }
}

