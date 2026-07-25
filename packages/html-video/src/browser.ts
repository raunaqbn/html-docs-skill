import { existsSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { buildPlayerDocument } from './runtime'
import type { SnapshotResult, ValidationFinding, VideoComposition } from './types'

const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
]

export async function resolveChromiumPath(explicit?: string): Promise<string> {
  const candidates = [explicit, process.env.HTML_VIDEO_CHROMIUM_PATH, process.env.PUPPETEER_EXECUTABLE_PATH, ...MAC_CHROME_PATHS]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  if (process.platform === 'linux') return chromium.executablePath()
  throw new Error('No Chromium executable found. Set HTML_VIDEO_CHROMIUM_PATH or install Google Chrome.')
}

export async function launchVideoBrowser(executablePath?: string): Promise<Browser> {
  const path = await resolveChromiumPath(executablePath)
  return puppeteer.launch({
    executablePath: path,
    headless: true,
    args: process.platform === 'linux'
      ? [...chromium.args, '--disable-dev-shm-usage', '--no-sandbox']
      : ['--disable-dev-shm-usage', '--no-sandbox'],
    defaultViewport: null,
  })
}

export async function prepareCompositionPage(
  browser: Browser,
  composition: VideoComposition,
  variables: Record<string, unknown> = {},
): Promise<Page> {
  const page = await browser.newPage()
  await page.setViewport({ width: composition.width, height: composition.height, deviceScaleFactor: 1 })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = request.url()
    if (url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:')) request.continue()
    else request.abort('blockedbyclient')
  })
  await page.setContent(buildPlayerDocument(composition, { variables }), { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForFunction(() => (window as unknown as { __htmlVideoReady?: boolean }).__htmlVideoReady === true, { timeout: 10_000 })
  return page
}

export async function seekPage(page: Page, timeMs: number): Promise<void> {
  await page.evaluate(async (requestedTime) => {
    const seek = (window as unknown as { __htmlVideoSeek?: (timeMs: number) => Promise<unknown> }).__htmlVideoSeek
    if (!seek) throw new Error('HTML Video runtime did not register a seek function.')
    await seek(requestedTime)
  }, timeMs)
}

export async function captureSnapshots(
  composition: VideoComposition,
  timesMs: number[],
  options: { executablePath?: string; variables?: Record<string, unknown> } = {},
): Promise<SnapshotResult[]> {
  const browser = await launchVideoBrowser(options.executablePath)
  try {
    const page = await prepareCompositionPage(browser, composition, options.variables)
    const results: SnapshotResult[] = []
    for (const timeMs of timesMs) {
      await seekPage(page, timeMs)
      const png = await page.screenshot({ type: 'png', omitBackground: false })
      results.push({ timeMs, png: Buffer.from(png) })
    }
    await page.close()
    return results
  } finally {
    await browser.close()
  }
}

/**
 * Browser-level cue leak check. Auto-directed targets must be visually absent
 * immediately before their phrase and readable once the phrase settles.
 * Custom `effect:none` and SVG draw cues are reviewed from contact sheets
 * because opacity alone cannot represent their authored state.
 */
export async function inspectCueOwnership(
  composition: VideoComposition,
  options: { executablePath?: string; variables?: Record<string, unknown> } = {},
): Promise<ValidationFinding[]> {
  if (!composition.narration) return []
  const browser = await launchVideoBrowser(options.executablePath)
  try {
    const page = await prepareCompositionPage(browser, composition, options.variables)
    const findings: ValidationFinding[] = []
    for (const cue of composition.narration.cues) {
      if (cue.effect === 'none' || cue.effect === 'draw') continue
      const beforeTime = Math.max(0, cue.startMs - 16)
      const settledTime = Math.min(composition.durationMs, cue.endMs)
      const before = await inspectTargetsAt(page, cue.sceneId, cue.targets, beforeTime)
      const settled = await inspectTargetsAt(page, cue.sceneId, cue.targets, settledTime)
      if (before.some((target) => target.exists && target.opacity > 0.12)) {
        findings.push({
          code: 'cue_target_landed_early',
          severity: 'error',
          message: `Cue ${cue.id} has a target that is visibly landed before its owned phrase.`,
          path: `narration.cues.${cue.id}.targets`,
          timeMs: beforeTime,
        })
      }
      if (settled.some((target) => !target.exists || target.opacity < 0.72)) {
        findings.push({
          code: 'cue_target_not_settled',
          severity: 'warning',
          message: `Cue ${cue.id} has a target that is not clearly readable after its phrase settles.`,
          path: `narration.cues.${cue.id}.targets`,
          timeMs: settledTime,
        })
      }
    }
    await page.close()
    return findings
  } finally {
    await browser.close()
  }
}

async function inspectTargetsAt(page: Page, sceneId: string, selectors: string[], timeMs: number) {
  await seekPage(page, timeMs)
  return page.evaluate(({ sceneId: requestedScene, selectors: requestedSelectors }) => {
    const scene = document.querySelector(`#hv-scene-${CSS.escape(requestedScene)}`)
    return requestedSelectors.map((selector) => {
      const element = scene?.querySelector(selector)
      if (!element) return { exists: false, opacity: 0 }
      const style = getComputedStyle(element)
      return {
        exists: true,
        opacity: element.getClientRects().length === 0 || style.visibility === 'hidden'
          ? 0
          : Number(style.opacity || 1),
      }
    })
  }, { sceneId, selectors })
}
