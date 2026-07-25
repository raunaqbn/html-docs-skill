#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  auditCourse,
  auditExplanation,
  auditComposition,
  buildExplanation,
  buildCourse,
  buildPlayerDocument,
  captureSnapshots,
  courseProjectSchema,
  diffCourseSource,
  diffExplanationSource,
  getSampleTimes,
  loadVideoInput,
  initExplanationProject,
  normalizeSourceInput,
  renderComposition,
  validateCompositionStatic,
  writeSourceSnapshot,
  type LoadedVideoInput,
  loadCourseProject,
  loadExplanationProject,
} from './index'

async function main() {
  const input = process.argv.slice(2)
  if (input[0] === 'course') return courseCommand(input.slice(1))
  if (input[0] === 'project') return projectCommand(input.slice(1))
  if (input[0] === 'studio') return studioCommand(input.slice(1))
  const [command, file, ...args] = input
  if (!command || !file) usage()
  const loaded = await loadVideoInput(file)
  const composition = loaded.composition
  if (command === 'build') {
    if (!loaded.project) throw new Error('build expects a video project directory or video.project.json.')
    const outputPath = resolve(option(args, '--output') || join(loaded.projectRoot!, 'composition.json'))
    await writeFile(outputPath, `${JSON.stringify(composition, null, 2)}\n`)
    console.log(JSON.stringify({ outputPath, durationMs: composition.durationMs, scenes: composition.scenes.length, cues: composition.narration?.cues.length ?? 0 }, null, 2))
    return
  }
  if (command === 'check') {
    const report = validateCompositionStatic(composition)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ok ? 0 : 1
    return
  }
  if (command === 'snapshot') {
    const atIndex = args.indexOf('--at')
    const times = atIndex >= 0 && args[atIndex + 1]
      ? args[atIndex + 1].split(',').map(Number)
      : getSampleTimes(composition)
    const snapshots = await captureSnapshots(composition, times)
    const outputDir = resolve(option(args, '--output-dir') || 'snapshots')
    await mkdir(outputDir, { recursive: true })
    for (const snapshot of snapshots) await writeFile(join(outputDir, `snapshot-${snapshot.timeMs}.png`), snapshot.png)
    console.log(JSON.stringify({ outputDir, snapshots: snapshots.length, timesMs: times }, null, 2))
    return
  }
  if (command === 'audit') {
    const result = await auditComposition(composition, { minimumScore: Number(option(args, '--minimum-score') || 78) })
    const outputDir = resolve(option(args, '--output-dir') || (loaded.projectRoot ? join(loaded.projectRoot, 'quality') : 'video-quality'))
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'quality-report.json'), `${JSON.stringify(result.report, null, 2)}\n`)
    if (result.contactSheet) await writeFile(join(outputDir, 'contact-sheet.png'), result.contactSheet)
    if (result.cueContactSheet) await writeFile(join(outputDir, 'cue-contact-sheet.png'), result.cueContactSheet)
    if (result.sceneContactSheet) await writeFile(join(outputDir, 'scene-contact-sheet.png'), result.sceneContactSheet)
    for (const snapshot of result.snapshots) await writeFile(join(outputDir, `frame-${snapshot.timeMs}.png`), snapshot.png)
    console.log(JSON.stringify({ ...result.report, outputDir }, null, 2))
    process.exitCode = result.report.ok ? 0 : 1
    return
  }
  if (command === 'render') {
    const outputIndex = args.indexOf('--output')
    const outputPath = outputIndex >= 0 && args[outputIndex + 1] ? resolve(args[outputIndex + 1]) : resolve('render.mp4')
    const result = await renderComposition(composition, {
      outputPath,
      audioPath: option(args, '--voiceover') || loaded.voiceoverPath,
      quality: (option(args, '--quality') as 'draft' | 'standard' | 'high' | undefined) ?? 'standard',
      onProgress({ frame, totalFrames }) {
        if (frame === 1 || frame === totalFrames || frame % 120 === 0) process.stderr.write(`Rendering ${frame}/${totalFrames} frames\r`)
      },
    })
    process.stderr.write('\n')
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (command === 'publish') {
    await publishLocalVideo(loaded, args)
    return
  }
  usage()
}

async function projectCommand(input: string[]) {
  const [command, target, ...args] = input
  if (!command || !target) projectUsage()
  if (command === 'init') {
    const source = option(args, '--topic') ? `topic:${option(args, '--topic')}` : target
    const requestedMode = option(args, '--mode') || 'auto'
    if (!['auto', 'document', 'video', 'document-video', 'course'].includes(requestedMode)) {
      throw new Error('--mode must be auto, document, video, document-video, or course.')
    }
    let mode = requestedMode
    if (mode === 'auto') {
      const normalized = await normalizeSourceInput(
        /^(?:https?:\/\/|topic:)/i.test(source) ? source : resolve(source),
        {
          apiKey: option(args, '--api-key') || process.env.HTMLDOCS_API_KEY,
          crawl: args.includes('--crawl'),
          maxPages: Number(option(args, '--max-pages') || 100),
          maxDepth: Number(option(args, '--max-depth') || 2),
        },
      )
      mode = normalized.snapshot.entries.length >= 12 || normalized.evidence.length >= 24
        ? 'course'
        : 'document-video'
    }
    if (mode === 'course') {
      await courseCommand(['init', source, ...args])
      return
    }
    const title = option(args, '--title')
    const output = resolve(option(args, '--output') || `${slugify(title || source.replace(/^topic:/, ''))}-explanation`)
    const result = await initExplanationProject({
      source: /^(?:https?:\/\/|topic:)/i.test(source) ? source : resolve(source),
      output,
      mode: mode as 'document' | 'video' | 'document-video',
      title,
      audience: option(args, '--audience'),
      teachingOutcome: option(args, '--teaching-outcome'),
      voiceProfile: option(args, '--voice-profile'),
      crawl: args.includes('--crawl'),
      maxPages: Number(option(args, '--max-pages') || 100),
      maxDepth: Number(option(args, '--max-depth') || 2),
      apiKey: option(args, '--api-key') || process.env.HTMLDOCS_API_KEY,
    })
    console.log(JSON.stringify({
      projectRoot: result.root,
      project: join(result.root, 'explanation.project.json'),
      mode: result.project.mode,
      sourceFiles: result.sourceFiles,
      evidenceRecords: result.evidenceRecords,
      researchRequired: result.researchRequired,
      privatePreview: true,
    }, null, 2))
    return
  }
  if (command === 'build') {
    console.log(JSON.stringify(await buildExplanation(target), null, 2))
    return
  }
  if (command === 'audit') {
    const result = await auditExplanation(target, Number(option(args, '--minimum-score') || 78))
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.ok ? 0 : 1
    return
  }
  if (command === 'diff' || command === 'refresh') {
    const result = await diffExplanationSource(target)
    const { root } = await loadExplanationProject(target)
    if (command === 'refresh') {
      await Promise.all([
        writeFile(join(root, 'source', 'refresh-report.json'), `${JSON.stringify(result, null, 2)}\n`),
        writeFile(join(root, 'source', 'next-manifest.json'), `${JSON.stringify(result.snapshot.snapshot, null, 2)}\n`),
      ])
    }
    console.log(JSON.stringify({
      fingerprintChanged: result.fingerprintChanged,
      previousFingerprint: result.previousFingerprint,
      nextFingerprint: result.nextFingerprint,
      publicationChanged: false,
    }, null, 2))
    process.exitCode = result.fingerprintChanged ? 3 : 0
    return
  }
  if (command === 'preview') {
    await previewExplanation(target, Number(option(args, '--port') || 4173))
    return
  }
  if (command === 'publish') {
    const apiKey = option(args, '--api-key') || process.env.HTMLDOCS_API_KEY
    if (!apiKey) throw new Error('Set HTMLDOCS_API_KEY or pass --api-key.')
    const baseUrl = (option(args, '--base-url') || process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '')
    const audit = await auditExplanation(target, Number(option(args, '--minimum-score') || 78))
    if (!audit.ok && !args.includes('--skip-quality-gate')) throw new Error('Explanation quality gate failed. Run project audit and fix the findings.')
    const { root, project } = await loadExplanationProject(target)
    let document: Record<string, unknown> | undefined
    if (project.documentPath) {
      document = await apiHtml(
        `${baseUrl}/api/v1/docs`,
        apiKey,
        await readFile(join(root, project.documentPath), 'utf8'),
        project.title,
      )
    }
    if (project.videoProject) {
      const loaded = await loadVideoInput(join(root, project.videoProject))
      await publishLocalVideo(loaded, [
        '--prompt', project.teachingOutcome,
        '--title', project.title,
        '--provider', option(args, '--provider') || 'other-local-agent',
        '--api-key', apiKey,
        '--base-url', baseUrl,
        ...(typeof document?.id === 'string' ? ['--document', document.id] : []),
        ...(args.includes('--skip-quality-gate') ? ['--skip-quality-gate'] : []),
      ])
    } else {
      console.log(JSON.stringify({ document, privatePreview: true }, null, 2))
    }
    return
  }
  projectUsage()
}

async function previewExplanation(target: string, port: number) {
  await buildExplanation(target)
  const { root, project } = await loadExplanationProject(target)
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://localhost:${port}`)
      if (url.pathname === '/video' && project.videoProject) {
        const loaded = await loadVideoInput(join(root, project.videoProject))
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(buildPlayerDocument(loaded.composition))
        return
      }
      if (url.pathname !== '/') {
        response.statusCode = 404
        response.end('Not found')
        return
      }
      const page = project.documentPath
        ? await readFile(join(root, project.documentPath), 'utf8')
        : '<main><h1>Video explanation</h1></main>'
      const video = project.videoProject
        ? '<iframe title="Live HTML video" src="/video" style="display:block;width:min(1120px,92vw);aspect-ratio:16/9;margin:32px auto;border:0;border-radius:18px;background:#000"></iframe>'
        : ''
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(`${page}${video}`)
    } catch (error) {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : 'Preview failed')
    }
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolvePromise())
  })
  console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, mode: project.mode }, null, 2))
}

async function courseCommand(input: string[]) {
  const [command, target, ...args] = input
  if (!command || !target) courseUsage()
  if (command === 'init') {
    // Support both `course init <source> --output <directory>` and the more
    // natural skill-facing form `course init <directory> --source <source>`.
    const sourceTarget = option(args, '--topic')
      ? `topic:${option(args, '--topic')}`
      : option(args, '--source') || target
    const sourcePath = /^(?:https?:\/\/|topic:)/i.test(sourceTarget) ? sourceTarget : resolve(sourceTarget)
    const sourceLabel = sourcePath.startsWith('topic:')
      ? sourcePath.slice('topic:'.length)
      : /^https?:\/\//i.test(sourcePath)
        ? new URL(sourcePath).hostname
        : basename(sourcePath)
    const normalized = await normalizeSourceInput(sourcePath, {
      safeToExposePaths: args.includes('--safe-paths'),
      uploadMode: args.includes('--full-source') ? 'full-source' : 'used-excerpts',
      apiKey: option(args, '--api-key') || process.env.HTMLDOCS_API_KEY,
      crawl: args.includes('--crawl'),
      maxPages: Number(option(args, '--max-pages') || 100),
      maxDepth: Number(option(args, '--max-depth') || 2),
    })
    const title = option(args, '--title') || `${sourceLabel} course`
    const slug = slugify(option(args, '--slug') || title)
    const output = resolve(
      option(args, '--source')
        ? target
        : option(args, '--output') || `${slug}-course`,
    )
    const courseId = identifier(slug)
    const lessonId = 'foundations'
    const lessonRoot = join(output, 'lessons', '01-foundations')
    const firstSource = normalized.snapshot.entries.find((entry) => entry.kind !== 'binary')
    const evidenceId = normalized.evidence[0]?.id || firstSource?.evidenceId || 'source_overview'
    const sourceDependency = firstSource?.path || normalized.snapshot.entries[0]?.path || 'research-manifest'
    await Promise.all([
      mkdir(join(lessonRoot, 'audio', 'segments'), { recursive: true }),
      mkdir(join(lessonRoot, 'scenes'), { recursive: true }),
      mkdir(join(lessonRoot, 'quality'), { recursive: true }),
      mkdir(join(lessonRoot, 'renders'), { recursive: true }),
      mkdir(join(output, 'learning', 'records'), { recursive: true }),
      mkdir(join(output, 'production'), { recursive: true }),
      mkdir(join(output, 'assets'), { recursive: true }),
    ])
    await writeSourceSnapshot(output, normalized)
    const project = courseProjectSchema.parse({
      kind: 'html-course-project',
      version: 1,
      id: courseId,
      title,
      description: `A source-grounded course generated from ${sourceLabel}.`,
      audience: option(args, '--audience') || 'Learners who need a clear working mental model',
      depth: option(args, '--depth') || 'intermediate',
      learningOutcomes: ['Explain the source’s central model', 'Apply the model to a realistic example'],
      visibility: 'private',
      voiceProfile: option(args, '--voice-profile') || 'warm-teacher',
      designPath: 'design.md',
      source: {
        manifestPath: 'source/manifest.json',
        evidencePath: 'source/evidence.jsonl',
        fingerprintsPath: 'source/fingerprints.json',
      },
      learning: {
        learnerPath: 'learning/LEARNER.md',
        glossaryPath: 'learning/GLOSSARY.md',
        resourcesPath: 'learning/RESOURCES.md',
        recordsDirectory: 'learning/records',
        masteryModel: 'evidence-state',
      },
      production: {
        specificationPath: 'COURSE-SPEC.md',
        slicesDirectory: 'production',
        strategy: 'vertical-slices',
      },
      website: { slug },
      modules: [{
        id: 'core',
        title: 'Core model',
        summary: 'Build the central mental model before adding detail.',
        lessons: [{
          id: lessonId,
          slug: 'foundations',
          title: 'Foundations',
          summary: 'A visual introduction grounded in the source.',
          objectives: ['Describe the central mechanism', 'Recognize the mechanism in context'],
          prerequisites: [],
          evidenceIds: [evidenceId],
          sourceDependencies: [sourceDependency],
          page: 'lessons/01-foundations/page.html',
          videoProject: 'lessons/01-foundations/video.project.json',
          durationTargetMinutes: 7,
          mastery: [
            {
              id: 'explain-central-mechanism',
              objective: 'Describe the central mechanism',
              successCriteria: ['Explain the mechanism in the learner’s own words and identify its causal steps'],
              prerequisiteObjectiveIds: [],
              initialState: 'unseen',
            },
            {
              id: 'apply-central-mechanism',
              objective: 'Recognize the mechanism in context',
              successCriteria: ['Apply the mechanism to a new example without relying on surface wording'],
              prerequisiteObjectiveIds: ['explain-central-mechanism'],
              initialState: 'unseen',
            },
          ],
          practice: {
            retrieval: 'Predict the source-to-understanding transformation before the model is revealed.',
            guided: 'Label each step of the central mechanism with feedback from the cited evidence.',
            transfer: 'Apply the mechanism to a new case with different surface details.',
            feedback: 'Explain which causal step supports or contradicts the learner’s answer.',
          },
          productionSlice: 'production/01-foundations.md',
          checks: [
            {
              id: 'check-one',
              prompt: 'Which statement best captures the central mechanism?',
              choices: ['The source-grounded explanation', 'An unrelated assumption'],
              answer: 0,
              explanation: 'The first choice traces the mechanism to lesson evidence.',
              evidenceIds: [evidenceId],
              objectiveId: 'explain-central-mechanism',
              kind: 'discrimination',
              expectedReasoning: 'The learner distinguishes the evidence-backed mechanism from an unsupported claim.',
              feedback: {
                correct: 'Correct: the mechanism remains traceable to the captured evidence.',
                misconceptions: { '1': 'That choice is not supported by the lesson evidence. Revisit the causal steps.' },
              },
              masteryTransition: 'practiced',
            },
            {
              id: 'check-two',
              prompt: 'What should you consult when applying the model to a new case?',
              choices: ['The cited source evidence', 'An unsupported assumption'],
              answer: 0,
              explanation: 'Transfer remains constrained by the captured evidence.',
              evidenceIds: [evidenceId],
              objectiveId: 'apply-central-mechanism',
              kind: 'transfer',
              expectedReasoning: 'The learner uses evidence and the causal model rather than matching surface wording.',
              feedback: {
                correct: 'Correct: transfer uses the model while remaining grounded in evidence.',
                misconceptions: { '1': 'An unsupported assumption cannot justify applying the model.' },
              },
              masteryTransition: 'demonstrated',
            },
          ],
          status: 'planned',
        }],
      }],
      generation: {
        createdAt: new Date().toISOString(),
        sourceFingerprint: normalized.snapshot.fingerprint,
        privatePreviewOnly: true,
      },
    })
    const sceneHtml = `<div class="lesson-stage">
  <p class="eyebrow">FOUNDATIONS</p>
  <h1 data-html-video-id="central-model">${escapeHtml(title)}</h1>
  <div class="flow" data-html-video-id="source-flow">
    <span>Source</span><span class="arrow">→</span><span>Model</span><span class="arrow">→</span><span>Application</span>
  </div>
  <p class="note">Replace this scaffold with the lesson’s evidence-grounded explanatory diagram.</p>
</div>`
    const sceneCss = `.lesson-stage{position:absolute;inset:0;display:grid;place-content:center;gap:32px;padding:72px;background:radial-gradient(circle at 20% 15%,#23335f,#0b1020 62%);color:#f7f8ff;font-family:Inter,ui-sans-serif,system-ui;text-align:center}.eyebrow{margin:0;color:#a8c7ff;font-size:18px;letter-spacing:.22em}.lesson-stage h1{margin:0;max-width:980px;font-size:68px;line-height:1.02;letter-spacing:-.05em}.flow{display:flex;align-items:center;justify-content:center;gap:20px;font-size:28px}.flow span:not(.arrow){padding:18px 24px;border:1px solid #7895d8;border-radius:16px;background:#152345}.arrow{color:#ffd87a}.note{max-width:760px;margin:0 auto;color:#bdc7df;font-size:18px}`
    const videoProject = {
      kind: 'html-video-project',
      version: 2,
      id: `${courseId}-foundations`,
      title: `${title}: Foundations`,
      width: 1280,
      height: 720,
      fps: 30,
      variables: [],
      assets: [],
      captions: { defaultOn: true, minWords: 2, maxWords: 6, pauseMs: 360 },
      source: { evidenceIds: [evidenceId], sourceHash: normalized.snapshot.fingerprint },
      manualOverrides: [],
      scenes: [{
        id: 'central-model',
        label: 'The central model',
        teachingJob: 'Give the learner one memorable map of the subject.',
        evidenceIds: [evidenceId],
        layout: 'diagram',
        html: 'scenes/01-central-model.html',
        css: 'scenes/01-central-model.css',
        script: 'scenes/01-central-model.js',
        durationMs: 8_000,
        cues: [],
        transition: 'crossfade',
      }],
    }
    await Promise.all([
      writeFile(join(output, 'course.project.json'), `${JSON.stringify(project, null, 2)}\n`),
      writeFile(join(output, 'COURSE.md'), `# ${title}\n\nAudience: ${project.audience}\n\nThis file is the human-readable course brief. Replace the scaffold with a source-grounded module map that advances the learner contract and observable finish line.\n`),
      writeFile(join(output, 'COURSE-SPEC.md'), `# Course specification: ${title}\n\n## Learning problem\nLearners need a reliable working model of ${sourceLabel} rather than disconnected facts.\n\n## Learner and finish line\n${project.audience}. They can explain the central mechanism and apply it to a new case.\n\n## Learner journeys\n1. As a learner, I want a visual causal model, so I can reason about the source instead of memorizing it.\n2. As a learner, I want diagnostic practice, so I can tell whether I can transfer the model.\n\n## Teaching decisions\n- Begin with one cumulative model and add detail only when it advances the finish line.\n- Use retrieval, explanation, guided practice, transfer, and consolidation.\n\n## Artifact decisions\n- Pages hold durable detail and citations.\n- Videos teach motion, sequence, and causality.\n- Checks diagnose objective-level understanding and return specific feedback.\n\n## Evidence and uncertainty\n- Source manifest: source/manifest.json\n- Evidence graph: source/evidence.jsonl\n- Replace scaffold assumptions with explicit evidence gaps before authoring.\n\n## Assessment decisions\n- Require an independent explanation and a changed-surface transfer task.\n\n## Accessibility and delivery\n- Private preview, responsive pages, keyboard operation, captions on, reduced-motion support.\n\n## Exclusions\n- Topics that do not advance the learner’s stated purpose.\n\n## Open decisions\n- Replace with only the unresolved decisions that can change the course.\n`),
      writeFile(join(output, 'design.md'), '# Course design\n\nUse one shared visual language, reserve the bottom 17% for captions, and rotate framing systems across scenes. Motion follows build → develop → settle.\n'),
      writeFile(join(output, 'index.html'), `<main><p>PRIVATE COURSE PREVIEW</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(project.description)}</p><nav><a href="foundations">Start with Foundations</a></nav></main>\n`),
      writeFile(join(output, 'learning', 'LEARNER.md'), `# Learner contract: ${title}\n\n## Purpose\nBuild a working model of ${sourceLabel} that supports a real decision or task.\n\n## Finish line\n- Explain the central mechanism in the learner’s own words.\n- Apply it independently to a new example.\n\n## Starting point\n- Record relevant prior knowledge as claimed or demonstrated.\n\n## Constraints\n- Private preview; source-grounded claims; accessible document and captioned video.\n\n## Exclusions\n- Adjacent material that does not advance the finish line.\n`),
      writeFile(join(output, 'learning', 'GLOSSARY.md'), `# ${title} glossary\n\nAdd a term only after the learner can use it correctly. Keep one canonical label and a short operational definition.\n`),
      writeFile(join(output, 'learning', 'RESOURCES.md'), `# ${title} resources\n\n## Authoritative sources\n\n- ${sourceLabel}\n  Use for: the claims represented by ${evidenceId} and its source dependencies.\n\n## Evidence gaps\n\n- Replace this line with any question the frozen source snapshot cannot yet support.\n`),
      writeFile(join(output, 'production', '01-foundations.md'), `# 01 — Foundations\n\n## Learner-visible result\nA complete first lesson that turns source evidence into a visual mental model, narrated explanation, guided practice, transfer check, and specific feedback.\n\n## Depends on\nNothing.\n\n## Acceptance\n- [ ] Every substantive claim maps to ${evidenceId} or another frozen evidence record.\n- [ ] Page, video, captions, checks, and player form one reviewable private lesson.\n- [ ] The transfer check can justify a mastery-state update from learner evidence.\n\n## Source scope\n- Evidence: ${evidenceId}\n- Dependency: ${sourceDependency}\n`),
      writeFile(join(lessonRoot, 'lesson.json'), `${JSON.stringify(project.modules[0].lessons[0], null, 2)}\n`),
      writeFile(join(lessonRoot, 'page.html'), `<article><h1>${escapeHtml(project.modules[0].lessons[0].title)}</h1><p>${escapeHtml(project.modules[0].lessons[0].summary)}</p><html-video data-project-id="${escapeHtml(videoProject.id)}"><video controls playsinline></video></html-video></article>\n`),
      writeFile(join(lessonRoot, 'BRIEF.md'), `# Lesson brief\n\nTeaching job: ${project.modules[0].lessons[0].objectives[0]}\n\nEvidence: ${evidenceId}\n`),
      writeFile(join(lessonRoot, 'SCRIPT.md'), '# Locked narration\n\nAuthor phrase-shaped narration from the evidence graph. Every word must belong to one cue.\n'),
      writeFile(join(lessonRoot, 'STORYBOARD.md'), '# Storyboard\n\nEach scene records teaching job, evidence, narration cues, visual targets, transition semantics, and settled read.\n'),
      writeFile(join(lessonRoot, 'video.project.json'), `${JSON.stringify(videoProject, null, 2)}\n`),
      writeFile(join(lessonRoot, 'scenes', '01-central-model.html'), sceneHtml),
      writeFile(join(lessonRoot, 'scenes', '01-central-model.css'), sceneCss),
      writeFile(join(lessonRoot, 'scenes', '01-central-model.js'), `var p=h.ease.outCubic(progress);var model=root.querySelector('[data-html-video-id="central-model"]');var flow=root.querySelector('[data-html-video-id="source-flow"]');model.style.opacity=String(h.phase(p,0,.45));flow.style.opacity=String(h.phase(p,.32,.78));flow.style.transform='translate3d(0,'+h.lerp(24,0,h.phase(p,.32,.78))+'px,0)';\n`),
    ])
    console.log(JSON.stringify({ courseRoot: output, courseProject: join(output, 'course.project.json'), sourceFiles: normalized.snapshot.entries.length, evidenceRecords: normalized.evidence.length, privatePreview: true }, null, 2))
    return
  }
  if (command === 'build') {
    console.log(JSON.stringify(await buildCourse(target), null, 2))
    return
  }
  if (command === 'audit') {
    const result = await auditCourse(target, Number(option(args, '--minimum-score') || 78))
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.ok ? 0 : 1
    return
  }
  if (command === 'diff' || command === 'refresh') {
    const result = await diffCourseSource(target, option(args, '--source'))
    const { root } = await loadCourseProject(target)
    if (command === 'refresh') {
      const reportPath = join(root, 'source', 'refresh-report.json')
      const nextPath = join(root, 'source', 'next-manifest.json')
      await Promise.all([
        writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`),
        writeFile(nextPath, `${JSON.stringify(result.snapshot, null, 2)}\n`),
      ])
      console.log(JSON.stringify({ ...result, reportPath, nextManifestPath: nextPath, publishedVersionChanged: false }, null, 2))
    } else {
      console.log(JSON.stringify(result, null, 2))
    }
    process.exitCode = result.affectedLessons.length ? 3 : 0
    return
  }
  if (command === 'preview') {
    await previewCourse(target, Number(option(args, '--port') || 4173))
    return
  }
  if (command === 'publish') {
    const { root, project } = await loadCourseProject(target)
    const apiKey = option(args, '--api-key') || process.env.HTMLDOCS_API_KEY
    const baseUrl = (option(args, '--base-url') || process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '')
    if (!apiKey) throw new Error('Set HTMLDOCS_API_KEY or pass --api-key.')
    const visibility = option(args, '--visibility') || 'private'
    if (!['private', 'unlisted', 'public'].includes(visibility)) throw new Error('--visibility must be private, unlisted, or public.')
    const publishManifest = JSON.parse(await readFile(join(root, 'publish-manifest.json'), 'utf8')) as unknown
    const sourceManifest = JSON.parse(await readFile(join(root, project.source.manifestPath), 'utf8')) as unknown
    const evidenceManifest = (await readFile(join(root, project.source.evidencePath), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .map((record) => ({
        id: record.id,
        sourceEvidenceId: record.sourceEvidenceId,
        uri: record.uri,
        sha256: record.sha256,
      }))
    const preview = await apiRequest(`${baseUrl}/api/v1/courses`, apiKey, 'POST', {
      project: { ...project, visibility },
      publish_manifest: publishManifest,
      source_manifest: sourceManifest,
      evidence_manifest: evidenceManifest,
    })
    const courseId = typeof preview.course_id === 'string' ? preview.course_id : undefined
    const uploaded = courseId
      ? await uploadCourseProject(root, courseId, Number(preview.version), baseUrl, apiKey)
      : { files: 0 }
    const site = courseId
      ? await apiRequest(`${baseUrl}/api/v1/courses/${courseId}/materialize`, apiKey, 'POST', {})
      : null
    const result = visibility !== 'private' && courseId
      ? await apiRequest(`${baseUrl}/api/v1/courses/${courseId}/publish`, apiKey, 'POST', { visibility })
      : preview
    console.log(JSON.stringify({ preview, uploaded, site, publication: result }, null, 2))
    return
  }
  if (command === 'pull') {
    const apiKey = option(args, '--api-key') || process.env.HTMLDOCS_API_KEY
    const baseUrl = (option(args, '--base-url') || process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '')
    if (!apiKey) throw new Error('Set HTMLDOCS_API_KEY or pass --api-key.')
    const result = await apiRequest(`${baseUrl}/api/v1/courses/${encodeURIComponent(target)}`, apiKey, 'GET') as {
      course?: {
        project_files?: Array<{ path: string; sha256: string; bytes: number; download_url?: string | null }>
      }
    }
    const output = resolve(option(args, '--output') || `course-${target}`)
    await mkdir(output, { recursive: true })
    let downloaded = 0
    for (const file of result.course?.project_files ?? []) {
      if (!file.download_url) throw new Error(`Course file is missing a download URL: ${file.path}`)
      const destination = resolve(output, file.path)
      const rel = relative(output, destination)
      if (rel.startsWith('..') || rel.startsWith(sep)) throw new Error(`Remote project path escapes output: ${file.path}`)
      const response = await fetch(file.download_url)
      if (!response.ok) throw new Error(`Could not download ${file.path} (${response.status}).`)
      const bytes = Buffer.from(await response.arrayBuffer())
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (hash !== file.sha256) throw new Error(`Checksum mismatch while pulling ${file.path}.`)
      await mkdir(join(destination, '..'), { recursive: true })
      await writeFile(destination, bytes)
      downloaded += 1
    }
    await writeFile(join(output, '.html-docs-remote.json'), `${JSON.stringify(result, null, 2)}\n`)
    console.log(JSON.stringify({ output, downloaded }, null, 2))
    return
  }
  courseUsage()
}

async function studioCommand(input: string[]) {
  const [command, videoId, ...args] = input
  if (!command || !videoId || !['context', 'requests', 'pull', 'push'].includes(command)) studioUsage()
  const apiKey = option(args, '--api-key') || process.env.HTMLDOCS_API_KEY
  const baseUrl = (option(args, '--base-url') || process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '')
  if (!apiKey) throw new Error('Set HTMLDOCS_API_KEY or pass --api-key.')
  if (command === 'context') {
    console.log(JSON.stringify(await apiRequest(`${baseUrl}/api/v1/videos/${videoId}/studio/context`, apiKey, 'GET'), null, 2))
    return
  }
  if (command === 'pull') {
    const result = await apiRequest(`${baseUrl}/api/v1/videos/${videoId}/versions?include=current`, apiKey, 'GET')
    const output = resolve(option(args, '--output') || `video-${videoId}-project.json`)
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
    console.log(JSON.stringify({ output, current_version_id: result.current_version_id ?? null }, null, 2))
    return
  }
  if (command === 'push') {
    const projectPath = option(args, '--project') || args.find((value) => !value.startsWith('--'))
    if (!projectPath) throw new Error('studio push requires a project directory or video.project.json.')
    const loaded = await loadVideoInput(projectPath)
    const audit = await auditComposition(loaded.composition)
    if (!audit.report.ok && !args.includes('--skip-quality-gate')) {
      throw new Error(`Quality gate failed (${audit.report.score}/${audit.report.minimumScore}).`)
    }
    const result = await apiRequest(`${baseUrl}/api/v1/videos/${videoId}/versions`, apiKey, 'POST', {
      project_bundle: loaded.project ?? { kind: 'compiled-html-video-project', input: loaded.inputPath },
      composition: loaded.composition,
      audio_manifest: loaded.composition.narration,
      caption_manifest: loaded.composition.captions,
      quality_report: audit.report,
      source_provenance: loaded.composition.authoring,
      generation_hash: loaded.composition.authoring?.generationHash,
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }
  const message = option(args, '--message')
  const result = message
    ? await apiRequest(`${baseUrl}/api/v1/videos/${videoId}/studio/requests`, apiKey, 'POST', { instruction: message })
    : await apiRequest(`${baseUrl}/api/v1/videos/${videoId}/studio/requests`, apiKey, 'GET')
  console.log(JSON.stringify(result, null, 2))
}

async function previewCourse(target: string, port: number) {
  const built = await buildCourse(target)
  const { root, project } = await loadCourseProject(target)
  const lessonById = new Map(project.modules.flatMap((module) => module.lessons).map((lesson) => [lesson.id, lesson]))
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://localhost:${port}`)
      if (url.pathname === '/') {
        const cards = project.modules.map((module) => `<section><h2>${escapeHtml(module.title)}</h2>${module.lessons.map((lesson) => `<a href="/lesson/${lesson.id}"><strong>${escapeHtml(lesson.title)}</strong><span>${escapeHtml(lesson.summary)}</span></a>`).join('')}</section>`).join('')
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(project.title)}</title><style>body{margin:0;background:#0b1020;color:#eef2ff;font:16px/1.5 ui-sans-serif,system-ui;padding:64px}main{max-width:980px;margin:auto}h1{font-size:56px;letter-spacing:-.05em}section{margin:48px 0}a{display:flex;justify-content:space-between;gap:32px;color:inherit;text-decoration:none;padding:24px;border:1px solid #334467;border-radius:18px;margin:14px 0;background:#111b34}span{color:#aebad5}</style><main><p>PRIVATE COURSE PREVIEW</p><h1>${escapeHtml(project.title)}</h1><p>${escapeHtml(project.description)}</p>${cards}</main>`)
        return
      }
      const match = url.pathname.match(/^\/lesson\/([^/]+)(?:\/video)?$/)
      const lesson = match ? lessonById.get(match[1]) : undefined
      if (!lesson) {
        response.statusCode = 404
        response.end('Not found')
        return
      }
      if (url.pathname.endsWith('/video')) {
        const loaded = await loadVideoInput(join(root, lesson.videoProject))
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(buildPlayerDocument(loaded.composition))
        return
      }
      const page = await readFile(join(root, lesson.page), 'utf8')
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end(`<!doctype html><meta charset="utf-8"><style>body{max-width:980px;margin:40px auto;font:18px/1.6 ui-sans-serif,system-ui}iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:16px;background:#000}</style><a href="/">← Course</a><iframe src="/lesson/${lesson.id}/video"></iframe>${page}`)
    } catch (error) {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : 'Preview failed')
    }
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolvePromise())
  })
  console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, lessons: built.lessons.length }, null, 2))
}

async function uploadCourseProject(root: string, courseId: string, version: number, baseUrl: string, apiKey: string) {
  const files: Array<{ path: string; absolute: string; sha256: string; bytes: number; content_type: string }> = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.env')) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      const file = await stat(absolute)
      if (file.size > 100 * 1024 * 1024) throw new Error(`Course project file exceeds 100 MB: ${absolute}`)
      const bytes = await readFile(absolute)
      files.push({
        path: relative(root, absolute).split(sep).join('/'),
        absolute,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        content_type: mimeType(absolute),
      })
    }
  }
  await walk(root)
  let uploaded = 0
  for (let start = 0; start < files.length; start += 40) {
    const batch = files.slice(start, start + 40)
    const prepared = await apiRequest(`${baseUrl}/api/v1/courses/${courseId}/uploads`, apiKey, 'POST', {
      version,
      files: batch.map(({ path, sha256, bytes, content_type }) => ({ path, sha256, bytes, content_type })),
    }) as {
      bucket: string
      supabase_url: string
      supabase_anon_key: string
      uploads: Array<{ path: string; storage_path: string; token: string; sha256: string; bytes: number; content_type: string }>
    }
    const storage = createClient(prepared.supabase_url, prepared.supabase_anon_key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).storage.from(prepared.bucket)
    for (const upload of prepared.uploads) {
      const file = batch.find((candidate) => candidate.path === upload.path)
      if (!file) throw new Error(`Prepared an unknown course project path: ${upload.path}`)
      const result = await storage.uploadToSignedUrl(upload.storage_path, upload.token, await readFile(file.absolute), {
        contentType: upload.content_type,
        upsert: true,
      })
      if (result.error) throw new Error(`Could not upload ${upload.path}: ${result.error.message}`)
    }
    await apiRequest(`${baseUrl}/api/v1/courses/${courseId}/uploads`, apiKey, 'PUT', {
      version,
      files: prepared.uploads.map(({ path, storage_path, sha256, bytes, content_type }) => ({
        path, storage_path, sha256, bytes, content_type,
      })),
    })
    uploaded += batch.length
  }
  return { files: uploaded, version }
}

async function publishLocalVideo(loaded: LoadedVideoInput, args: string[]) {
  const composition = loaded.composition
  const documentId = option(args, '--document')
  const prompt = option(args, '--prompt')
  const apiKey = option(args, '--api-key') || process.env.HTMLDOCS_API_KEY
  const baseUrl = (option(args, '--base-url') || process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '')
  if (!prompt) throw new Error('--prompt is required.')
  if (!apiKey) throw new Error('Set HTMLDOCS_API_KEY or pass --api-key with an account key from HTML Docs settings.')

  const report = validateCompositionStatic(composition)
  if (!report.ok) throw new Error(`Composition validation failed:\n${report.findings.map((finding) => `- ${finding.message}`).join('\n')}`)
  const audit = await auditComposition(composition)
  if (!audit.report.ok && !args.includes('--skip-quality-gate')) {
    throw new Error(`Quality gate failed (${audit.report.score}/${audit.report.minimumScore}). Run audit, inspect its contact sheet, and fix the reported scenes. Use --skip-quality-gate only for an intentional draft.`)
  }

  const requestedOutput = option(args, '--output')
  const workingDir = await mkdtemp(join(tmpdir(), 'html-docs-local-video-'))
  const outputPath = requestedOutput ? resolve(requestedOutput) : join(workingDir, 'render.mp4')
  const posterPath = join(workingDir, 'poster.png')
  try {
    const determinismTime = Math.floor(composition.durationMs * 0.6)
    const determinism = await captureSnapshots(composition, [determinismTime, determinismTime])
    if (!determinism[0]?.png.equals(determinism[1]?.png)) {
      throw new Error('Browser validation failed: repeated seeks to the same timestamp produced different pixels.')
    }
    const result = await renderComposition(composition, {
      outputPath,
      audioPath: option(args, '--voiceover') || loaded.voiceoverPath,
      quality: (option(args, '--quality') as 'draft' | 'standard' | 'high' | undefined) ?? 'standard',
      onProgress({ frame, totalFrames }) {
        if (frame === 1 || frame === totalFrames || frame % 30 === 0) {
          process.stderr.write(`Rendering ${frame}/${totalFrames} frames\r`)
        }
      },
    })
    process.stderr.write('\n')
    await writeFile(posterPath, determinism[0].png)

    const preparePath = documentId
      ? `${baseUrl}/api/v1/docs/${documentId}/videos`
      : `${baseUrl}/api/v1/videos`
    const prepare = await apiJson(preparePath, apiKey, {
      project_id: option(args, '--project-id') || undefined,
      prompt,
      title: option(args, '--title') || composition.title,
      after_region_key: option(args, '--after') || undefined,
      replace_region_key: option(args, '--replace-region') || undefined,
      quality: option(args, '--quality') || 'standard',
      provider: option(args, '--provider') || 'other-local-agent',
      model: option(args, '--model') || undefined,
      composition,
    }) as PrepareResponse

    const storage = createClient(prepare.upload.supabase_url, prepare.upload.supabase_anon_key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).storage.from(prepare.upload.bucket)
    const [videoBytes, posterBytes] = await Promise.all([readFile(outputPath), readFile(posterPath)])
    const [videoUpload, posterUpload] = await Promise.all([
      storage.uploadToSignedUrl(prepare.upload.video.path, prepare.upload.video.token, videoBytes, { contentType: 'video/mp4' }),
      storage.uploadToSignedUrl(prepare.upload.poster.path, prepare.upload.poster.token, posterBytes, { contentType: 'image/png' }),
    ])
    if (videoUpload.error) throw new Error(`Video upload failed: ${videoUpload.error.message}`)
    if (posterUpload.error) throw new Error(`Poster upload failed: ${posterUpload.error.message}`)

    const file = await stat(outputPath)
    const completePath = documentId
      ? `${baseUrl}/api/v1/docs/${documentId}/videos/${prepare.composition_id}/complete`
      : `${baseUrl}/api/v1/videos/${prepare.composition_id}/complete`
    const complete = await apiJson(
      completePath,
      apiKey,
      { render_id: prepare.render_id, frame_count: result.frameCount, file_size_bytes: file.size },
    )
    console.log(JSON.stringify({ ...complete, outputPath, compositionId: prepare.composition_id }, null, 2))
  } finally {
    await rm(workingDir, { recursive: true, force: true })
  }
}

type PrepareResponse = {
  composition_id: string
  render_id: string
  upload: {
    bucket: string
    supabase_url: string
    supabase_anon_key: string
    video: { path: string; token: string }
    poster: { path: string; token: string }
  }
}

function option(args: string[], name: string) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function apiJson(url: string, apiKey: string, body: unknown) {
  return apiRequest(url, apiKey, 'POST', body)
}

async function apiHtml(url: string, apiKey: string, body: string, title: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'text/html; charset=utf-8',
      'x-doc-title': title,
    },
    body,
  })
  const value = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `HTML Docs API failed (${response.status}).`)
  return value
}

async function apiRequest(url: string, apiKey: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const value = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : `HTML Docs API failed (${response.status}).`)
  return value
}

function mimeType(path: string) {
  const known: Record<string, string> = {
    '.json': 'application/json',
    '.jsonl': 'application/x-ndjson',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.vtt': 'text/vtt',
    '.srt': 'application/x-subrip',
  }
  return known[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'course'
}

function identifier(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '-')
  return /^[a-zA-Z]/.test(safe) ? safe : `course-${safe}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function usage(): never {
  console.error('Usage: html-docs-video <build|check|snapshot|audit|render|publish> <project-dir|composition.json> [options]')
  console.error('       html-docs-video project <init|build|audit|preview|publish|diff|refresh> <source-or-project> [options]')
  console.error('       html-docs-video course <init|build|audit|preview|publish|pull|diff|refresh> <source-or-course> [options]')
  console.error('       html-docs-video studio <context|requests|pull|push> <video-id> [options]')
  process.exit(2)
}

function projectUsage(): never {
  console.error('Usage: html-docs-video project <init|build|audit|preview|publish|diff|refresh> <source-or-project> [options]')
  console.error('Modes: auto | document | video | document-video | course')
  process.exit(2)
}

function courseUsage(): never {
  console.error('Usage: html-docs-video course <init|build|audit|preview|publish|pull|diff|refresh> <source-or-course> [options]')
  process.exit(2)
}

function studioUsage(): never {
  console.error('Usage: html-docs-video studio <context|requests|pull|push> <video-id> [project] [options]')
  process.exit(2)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})
