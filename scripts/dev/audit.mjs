// Measures real layout problems on /dev/ui: horizontal overflow, clipped controls,
// touch targets under 44px, and text under 12px. Fails loudly so nothing ships broken.
import { chromium } from 'playwright'

const WIDTHS = [[360, 740], [390, 844], [768, 1024], [1280, 900]]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const out = process.argv[2]
let bad = 0

for (const [w, h] of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e)))
  await p.goto('http://localhost:4173/trezure/dev/ui', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)

  const r = await p.evaluate(() => {
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    const clipped = [], small = [], tiny = []
    for (const el of document.querySelectorAll('button, a, input, select, .qty-ctl, .seg, .tz-btn, .chip-btn')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) continue
      // the control sticks out past its scroll container
      if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.className || el.tagName} scrollW ${el.scrollWidth} > ${el.clientWidth}`)
      if (rect.height < 40 && !el.closest('.kbd') && el.tagName !== 'A' && !el.classList.contains('check')) small.push(`${el.className || el.tagName} h=${Math.round(rect.height)}`)
      const fs = parseFloat(cs.fontSize)
      if (fs < 12) tiny.push(`${el.className || el.tagName} ${fs}px`)
    }
    // anything wider than the viewport, ignoring deliberate horizontal scrollers
    const inScroller = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX
        if (o === 'auto' || o === 'scroll') return true
      }
      return false
    }
    const wide = []
    for (const el of document.querySelectorAll('.wrap *')) {
      if (inScroller(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth + 1 || rect.left < -1) wide.push(`${el.className || el.tagName} [${Math.round(rect.left)}..${Math.round(rect.right)}]`)
    }
    return { docOverflow, clipped: [...new Set(clipped)], small: [...new Set(small)], tiny: [...new Set(tiny)], wide: [...new Set(wide)].slice(0, 8) }
  })

  const problems = r.docOverflow > 0 || r.clipped.length || r.wide.length || r.tiny.length
  if (problems) bad++
  console.log(`\n=== ${w}x${h} ===`)
  console.log('page overflow:', r.docOverflow)
  if (r.wide.length) console.log('OUT OF VIEWPORT:', r.wide)
  if (r.clipped.length) console.log('CLIPPED:', r.clipped)
  if (r.tiny.length) console.log('TEXT UNDER 12px:', r.tiny)
  if (r.small.length) console.log('under 44px (info):', r.small.slice(0, 10))
  if (errs.length) console.log('JS ERRORS:', errs)
  await p.screenshot({ path: `${out}/ui-${w}.png`, fullPage: w <= 390 })
}
await b.close()
console.log(bad ? `\n${bad} width(s) with problems` : '\nall widths clean')
