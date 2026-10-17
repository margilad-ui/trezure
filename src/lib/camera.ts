import { useEffect, useRef, useState, type RefObject } from 'react'
import { pickBackCamera } from './image'
import { detector, nativeDetector, type Found } from './scan'

/** Starts the main back camera into a video element, with continuous focus and, where the phone has one, a torch. */
export function useBackCamera(videoRef: RefObject<HTMLVideoElement | null>, size = 1280) {
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState(false)
  const [torch, setTorch] = useState<null | boolean>(null) // null = no torch on this camera

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const deviceId = await pickBackCamera()
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: size }, height: { ideal: size } } : { facingMode: { ideal: 'environment' }, width: { ideal: size }, height: { ideal: size } },
        })
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        streamRef.current = s
        const track = s.getVideoTracks()[0]
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean }
          if (caps?.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
          if (caps?.torch) setTorch(false)
        } catch { /* optional */ }
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}) }
        setError(false)
      } catch { setError(true) }
    })()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [videoRef, size])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || torch === null) return
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch) } catch { /* ignore */ }
  }
  return { error, torch, toggleTorch }
}

/**
 * Reads codes from a playing video every `every` ms while `on`. With `nativeOnly`, it never loads the
 * WASM fallback (used by the capture screen, which must stay light).
 */
export function useScanLoop(videoRef: RefObject<HTMLVideoElement | null>, on: boolean, onFound: (f: Found[]) => void, every = 220, nativeOnly = false) {
  const cb = useRef(onFound)
  cb.current = onFound
  useEffect(() => {
    if (!on) return
    let stop = false
    let timer: number | undefined
    void (async () => {
      const d = nativeOnly ? await nativeDetector() : await detector().catch(() => null)
      if (!d || stop) return
      const tick = async () => {
        if (stop) return
        const v = videoRef.current
        if (v && v.readyState >= 2 && v.videoWidth) {
          try { const found = await d.detect(v); if (!stop && found.length) cb.current(found) } catch { /* frame not ready */ }
        }
        if (!stop) timer = window.setTimeout(() => void tick(), every)
      }
      void tick()
    })()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [videoRef, on, every, nativeOnly])
}
