/** Camera frame to square WebP: 1600px main (quality .85) and 320px thumb. All in the browser. */

export interface Shot { blob: Blob; thumb: Blob; width: number; height: number }

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type, q))
}

export async function squareFromVideo(video: HTMLVideoElement, max = 1600): Promise<Shot> {
  const vw = video.videoWidth, vh = video.videoHeight
  const side = Math.min(vw, vh)
  const sx = (vw - side) / 2, sy = (vh - side) / 2
  const out = Math.min(side, max)
  const c = document.createElement('canvas'); c.width = out; c.height = out
  const ctx = c.getContext('2d', { alpha: false })!
  ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out)
  const blob = await toBlob(c, 'image/webp', 0.85)
  const tc = document.createElement('canvas'); tc.width = 320; tc.height = 320
  tc.getContext('2d', { alpha: false })!.drawImage(c, 0, 0, 320, 320)
  const thumb = await toBlob(tc, 'image/webp', 0.8)
  return { blob, thumb, width: out, height: out }
}

export async function squareFromFile(file: File, max = 1600): Promise<Shot> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const sx = (bmp.width - side) / 2, sy = (bmp.height - side) / 2
  const out = Math.min(side, max)
  const c = document.createElement('canvas'); c.width = out; c.height = out
  c.getContext('2d', { alpha: false })!.drawImage(bmp, sx, sy, side, side, 0, 0, out, out)
  const blob = await toBlob(c, 'image/webp', 0.85)
  const tc = document.createElement('canvas'); tc.width = 320; tc.height = 320
  tc.getContext('2d', { alpha: false })!.drawImage(c, 0, 0, 320, 320)
  const thumb = await toBlob(tc, 'image/webp', 0.8)
  return { blob, thumb, width: out, height: out }
}

/**
 * A photo from the gallery: the whole picture fitted into the square (white around it), never cropped,
 * because a gallery photo was not framed for our square viewfinder. Also returns the decoded bitmap so the
 * caller can look for a barcode in it before it is thrown away.
 */
export async function squareFitFromFile(file: File, max = 1600): Promise<Shot & { bitmap: ImageBitmap }> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(max, Math.max(bmp.width, bmp.height))
  const k = side / Math.max(bmp.width, bmp.height)
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas'); c.width = side; c.height = side
  const x = c.getContext('2d', { alpha: false })!
  x.fillStyle = '#fff'; x.fillRect(0, 0, side, side)
  x.imageSmoothingQuality = 'high'
  x.drawImage(bmp, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h)
  const blob = await toBlob(c, 'image/webp', 0.85)
  const tc = document.createElement('canvas'); tc.width = 320; tc.height = 320
  tc.getContext('2d', { alpha: false })!.drawImage(c, 0, 0, 320, 320)
  const thumb = await toBlob(tc, 'image/webp', 0.8)
  return { blob, thumb, width: side, height: side, bitmap: bmp }
}

/** Picks the main back camera: not ultra wide, not telephoto, when labels allow. */
export async function pickBackCamera(): Promise<string | undefined> {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
    if (devs.length <= 1) return devs[0]?.deviceId
    const back = devs.filter(d => /back|rear|environment|אחור/i.test(d.label))
    const pool = back.length ? back : devs
    const main = pool.find(d => !/ultra|wide|tele|macro|depth|0\.5|2x|3x|5x/i.test(d.label)) || pool[0]
    return main?.deviceId
  } catch { return undefined }
}
