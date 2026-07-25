import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import {
  assignWordOwnership,
  buildCaptionGroups,
  captionsToSrt,
  captionsToWebVtt,
  extractAudioWaveform,
  voiceProfileIdSchema,
} from './audio'
import { resolveFfmpegPath } from './ffmpeg'
import {
  videoCompositionSchema,
  normalizeLegacySemanticInput,
  type VideoComposition,
  type VideoManualOverride,
  type VideoNarrationCue,
  type VideoWordTiming,
} from './types'

const cueTargetSchema = z.string().regex(/^#[a-zA-Z][a-zA-Z0-9_-]*$/, 'Cue targets must be unique ID selectors such as #scan-result.')
const semanticIdSchema = z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)

const projectCueSchema = z.object({
  id: semanticIdSchema,
  text: z.string().min(1),
  displayText: z.string().min(1).optional(),
  targets: z.array(cueTargetSchema).min(1).max(20),
  effect: z.enum(['fade', 'rise', 'scale', 'wipe', 'draw', 'none']).default('rise'),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().positive().optional(),
  visualVerb: z.string().min(1).max(120).optional(),
  settledState: z.string().min(1).max(500).optional(),
})

const projectSceneSchema = z.object({
  id: semanticIdSchema,
  label: z.string().min(1),
  layout: z.enum(['centered', 'asymmetric', 'split', 'diagram', 'timeline', 'triptych', 'layered', 'full-width']),
  html: z.string().min(1),
  css: z.string().optional(),
  script: z.string().optional(),
  durationMs: z.number().int().min(250).optional(),
  narration: z.string().min(1).optional(),
  cues: z.array(projectCueSchema).default([]),
  transition: z.enum(['cut', 'crossfade', 'push-left', 'push-up', 'zoom']).default('cut'),
})

const projectAssetSchema = z.object({
  id: semanticIdSchema,
  kind: z.enum(['image', 'video', 'audio', 'font']),
  src: z.string().min(1),
  mimeType: z.string().min(1).optional(),
})

const videoProjectV1Schema = z.object({
  kind: z.literal('html-video-project'),
  version: z.literal(1),
  id: semanticIdSchema,
  title: z.string().min(1).max(200),
  width: z.number().int().min(240).max(4096).default(1280),
  height: z.number().int().min(240).max(4096).default(720),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  globalCss: z.string().optional(),
  variables: z.array(z.object({
    id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
    label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'color']),
    default: z.union([z.string(), z.number(), z.boolean()]),
  })).default([]),
  assets: z.array(projectAssetSchema).default([]),
  voiceover: z.object({
    audio: z.string().min(1),
    timings: z.string().min(1).optional(),
  }).optional(),
  scenes: z.array(projectSceneSchema).min(1).max(100),
})

const projectCueV2Schema = z.object({
  id: semanticIdSchema,
  spokenText: z.string().min(1),
  displayText: z.string().min(1).optional(),
  targets: z.array(semanticIdSchema).min(1).max(20),
  effect: z.enum(['fade', 'rise', 'scale', 'wipe', 'draw', 'none']).default('rise'),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().positive().optional(),
  visualVerb: z.string().min(1).max(120),
  settledState: z.string().min(1).max(500),
})

const projectSceneV2Schema = z.object({
  id: semanticIdSchema,
  label: z.string().min(1),
  teachingJob: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  layout: z.enum(['centered', 'asymmetric', 'split', 'diagram', 'timeline', 'triptych', 'layered', 'full-width']),
  html: z.string().min(1),
  css: z.string().optional(),
  script: z.string().optional(),
  durationMs: z.number().int().min(250).optional(),
  spokenText: z.string().min(1).optional(),
  cues: z.array(projectCueV2Schema).default([]),
  transition: z.enum(['cut', 'crossfade', 'push-left', 'push-up', 'zoom']).default('cut'),
})

const projectManualOverrideSchema = z.object({
  elementId: semanticIdSchema,
  sceneId: semanticIdSchema,
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

const videoProjectV2Schema = z.object({
  kind: z.literal('html-video-project'),
  version: z.literal(2),
  id: semanticIdSchema,
  title: z.string().min(1).max(200),
  width: z.number().int().min(240).max(4096).default(1280),
  height: z.number().int().min(240).max(4096).default(720),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  globalCss: z.string().optional(),
  variables: z.array(z.object({
    id: semanticIdSchema,
    label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'color']),
    default: z.union([z.string(), z.number(), z.boolean()]),
  })).default([]),
  assets: z.array(projectAssetSchema).default([]),
  audio: z.object({
    master: z.string().min(1),
    timings: z.string().min(1),
    manifest: z.string().min(1).optional(),
    provider: z.enum(['elevenlabs', 'heygen', 'kokoro', 'custom']).optional(),
    voiceProfile: voiceProfileIdSchema.default('warm-teacher'),
  }).optional(),
  captions: z.object({
    defaultOn: z.boolean().default(true),
    minWords: z.number().int().min(1).max(6).default(2),
    maxWords: z.number().int().min(2).max(8).default(6),
    pauseMs: z.number().int().min(100).max(2_000).default(360),
  }).default({}),
  source: z.object({
    evidenceIds: z.array(z.string().min(1)).default([]),
    sourceHash: z.string().optional(),
    generationHash: z.string().optional(),
  }).default({}),
  manualOverrides: z.array(projectManualOverrideSchema).default([]),
  scenes: z.array(projectSceneV2Schema).min(1).max(100),
})

export const videoProjectSchema = z.discriminatedUnion('version', [
  videoProjectV1Schema,
  videoProjectV2Schema,
])

export type VideoProject = z.infer<typeof videoProjectSchema>

export interface LoadedVideoInput {
  composition: VideoComposition
  inputPath: string
  projectRoot?: string
  voiceoverPath?: string
  project?: VideoProject
}

type WordTiming = VideoWordTiming

interface RuntimeCueSource {
  id: string
  text: string
  displayText?: string
  targets: string[]
  effect: 'fade' | 'rise' | 'scale' | 'wipe' | 'draw' | 'none'
  startMs?: number
  endMs?: number
  visualVerb?: string
  settledState?: string
}

interface RuntimeSceneSource {
  id: string
  label: string
  layout: VideoComposition['scenes'][number]['layout']
  html: string
  css?: string
  script?: string
  durationMs?: number
  narration?: string
  cues: RuntimeCueSource[]
  transition: 'cut' | 'crossfade' | 'push-left' | 'push-up' | 'zoom'
  teachingJob?: string
  evidenceIds?: string[]
}

export async function loadVideoInput(input: string): Promise<LoadedVideoInput> {
  const inputPath = resolve(input)
  const inputStat = await stat(inputPath)
  const jsonPath = inputStat.isDirectory() ? join(inputPath, 'video.project.json') : inputPath
  const value = normalizeLegacySemanticInput(JSON.parse(await readFile(jsonPath, 'utf8'))) as unknown
  if (isProjectValue(value)) return compileVideoProject(jsonPath, value)
  return { composition: videoCompositionSchema.parse(value), inputPath: jsonPath }
}

export async function compileVideoProject(projectFile: string, input?: unknown): Promise<LoadedVideoInput> {
  const inputPath = resolve(projectFile)
  const projectRoot = dirname(inputPath)
  const value = normalizeLegacySemanticInput(input ?? JSON.parse(await readFile(inputPath, 'utf8')))
  const project = videoProjectSchema.parse(value)
  validateProjectIds(project)
  const normalizedScenes = normalizeProjectScenes(project)

  const [globalCss, assets, sourceScenes] = await Promise.all([
    project.globalCss ? readProjectText(projectRoot, project.globalCss) : Promise.resolve(''),
    Promise.all(project.assets.map(async (asset) => {
      const assetPath = resolveProjectPath(projectRoot, asset.src)
      const bytes = await readFile(assetPath)
      const mimeType = asset.mimeType ?? inferMimeType(assetPath, asset.kind)
      return { id: asset.id, kind: asset.kind, mimeType, src: `data:${mimeType};base64,${bytes.toString('base64')}` }
    })),
    Promise.all(normalizedScenes.map(async (scene) => ({
      ...scene,
      htmlSource: normalizeLegacySemanticInput(await readProjectText(projectRoot, scene.html)) as string,
      cssSource: scene.css ? normalizeLegacySemanticInput(await readProjectText(projectRoot, scene.css)) as string : '',
      scriptSource: scene.script ? normalizeLegacySemanticInput(await readProjectText(projectRoot, scene.script)) as string : '',
    }))),
  ])

  for (const scene of sourceScenes) validateCueTargets(scene.id, scene.htmlSource, scene.cues)

  let audioDurationMs: number | undefined
  let voiceoverPath: string | undefined
  let wordTimings: WordTiming[] | undefined
  let waveform: number[] | undefined
  const voiceover = project.version === 1
    ? project.voiceover && { audio: project.voiceover.audio, timings: project.voiceover.timings }
    : project.audio && { audio: project.audio.master, timings: project.audio.timings }
  if (voiceover) {
    voiceoverPath = isAbsolute(voiceover.audio) ? resolve(voiceover.audio) : resolveProjectPath(projectRoot, voiceover.audio)
    audioDurationMs = await probeAudioDurationMs(voiceoverPath)
    waveform = await extractAudioWaveform(voiceoverPath)
    if (voiceover.timings) {
      const timingPath = resolveProjectPath(projectRoot, voiceover.timings)
      wordTimings = parseWordTimings(JSON.parse(await readFile(timingPath, 'utf8')))
    }
  }

  const timing = buildTiming(project, sourceScenes, audioDurationMs, wordTimings)
  const ownedWords = timing.narration && timing.words
    ? assignWordOwnership(timing.words, timing.narration.cues)
    : undefined
  const captionGroups = ownedWords && project.version === 2
    ? buildCaptionGroups(ownedWords, {
        minWords: project.captions.minWords,
        maxWords: project.captions.maxWords,
        pauseMs: project.captions.pauseMs,
      })
    : undefined
  const manualOverrides = project.version === 2 ? project.manualOverrides : []
  const composition = videoCompositionSchema.parse({
    version: 1,
    id: project.id,
    title: project.title,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationMs: timing.durationMs,
    html: [
      sourceScenes.map((scene) => [
        `<!-- html-video-scene:start ${scene.id} -->`,
        `<section id="hv-scene-${scene.id}" class="hv-scene hv-transition-${scene.transition}" data-html-video-scene="${scene.id}" data-layout="${scene.layout}" aria-hidden="true">`,
        scene.htmlSource,
        '</section>',
        `<!-- html-video-scene:end ${scene.id} -->`,
      ].join('\n')).join('\n'),
      captionGroups ? '<div id="hv-caption-safe-area" aria-live="off"><div id="hv-caption-line"></div></div>' : '',
    ].join('\n'),
    css: [
      '.hv-scene{position:absolute;inset:0;overflow:hidden;display:none;transform-origin:50% 50%}',
      '.hv-scene[aria-hidden="false"]{display:block}',
      captionGroups
        ? '#hv-caption-safe-area{position:absolute;z-index:9999;left:7%;right:7%;bottom:3%;height:14%;display:flex;align-items:center;justify-content:center;pointer-events:none}' +
          '#hv-caption-line{max-width:88%;padding:.34em .72em;border-radius:.55em;background:rgba(8,10,16,.82);color:#fff;font:700 clamp(24px,3.1vw,44px)/1.18 ui-sans-serif,system-ui,sans-serif;text-align:center;letter-spacing:-.02em;box-shadow:0 12px 35px rgba(0,0,0,.24)}' +
          '#hv-caption-line .hv-caption-word{opacity:.68}#hv-caption-line .hv-caption-word[data-active="true"]{opacity:1;color:var(--hv-caption-accent,#ffe58f)}'
        : '',
      globalCss,
      ...sourceScenes.map((scene) => `/* html-video-scene-css:start ${scene.id} */\n${scene.cssSource}\n/* html-video-scene-css:end ${scene.id} */`),
    ].join('\n'),
    script: buildProjectScript(sourceScenes, timing.scenes, timing.cues, manualOverrides, captionGroups, ownedWords),
    variables: project.variables,
    assets,
    scenes: timing.scenes,
    narration: timing.narration ? {
      ...timing.narration,
      words: ownedWords,
      provider: project.version === 2 ? project.audio?.provider : undefined,
      voiceProfile: project.version === 2 ? project.audio?.voiceProfile : undefined,
      waveform,
    } : undefined,
    captions: captionGroups ? {
      defaultOn: project.version === 2 ? project.captions.defaultOn : true,
      groups: captionGroups,
      words: ownedWords,
      webVtt: captionsToWebVtt(captionGroups),
      srt: captionsToSrt(captionGroups),
    } : undefined,
    chapters: timing.scenes.map((scene) => ({
      id: `chapter-${scene.id}`,
      title: scene.label ?? scene.id,
      sceneId: scene.id,
      startMs: scene.startMs,
    })),
    manualOverrides: manualOverrides.map((override) => ({
      elementId: override.elementId,
      sceneId: override.sceneId,
      properties: override.properties,
    })),
    authoring: project.version === 2 ? {
      projectVersion: 2,
      sourceHash: project.source.sourceHash,
      generationHash: project.source.generationHash,
      evidenceIds: [...new Set([
        ...project.source.evidenceIds,
        ...sourceScenes.flatMap((scene) => scene.evidenceIds ?? []),
      ])],
    } : { projectVersion: 1, evidenceIds: [] },
  })

  return { composition, inputPath, projectRoot, voiceoverPath, project }
}

function buildTiming(
  project: VideoProject,
  scenes: RuntimeSceneSource[],
  audioDurationMs?: number,
  wordTimings?: WordTiming[],
) {
  const narrated = project.version === 1 ? Boolean(project.voiceover) : Boolean(project.audio)
  if (!narrated) {
    let cursor = 0
    const timedScenes = scenes.map((scene) => {
      if (!scene.durationMs) throw new Error(`Scene ${scene.id} needs durationMs because this project has no voiceover timing authority.`)
      const value = {
        id: scene.id,
        label: scene.label,
        teachingJob: scene.teachingJob,
        evidenceIds: scene.evidenceIds,
        layout: scene.layout,
        startMs: cursor,
        durationMs: scene.durationMs,
        track: 0,
      }
      cursor += scene.durationMs
      return value
    })
    return {
      durationMs: cursor,
      scenes: timedScenes,
      cues: [] as VideoNarrationCue[],
      narration: undefined,
      words: undefined,
    }
  }

  if (!audioDurationMs) throw new Error('Narrated projects require a readable voiceover audio file.')
  for (const scene of scenes) {
    if (!scene.narration || scene.cues.length === 0) {
      throw new Error(`Narrated scene ${scene.id} needs narration plus one or more word-timed cues.`)
    }
    const narrationWords = tokenize(scene.narration)
    const cueWords = scene.cues.flatMap((cue) => tokenize(cue.text))
    if (narrationWords.join(' ') !== cueWords.join(' ')) {
      throw new Error(`Scene ${scene.id} cue text must cover its narration exactly, in order. Split the narration into cues; do not paraphrase it.`)
    }
  }

  let timingCursor = 0
  const cues: VideoNarrationCue[] = []
  for (const scene of scenes) {
    for (const cue of scene.cues) {
      let startMs = cue.startMs
      let endMs = cue.endMs
      if (wordTimings) {
        const cueWords = tokenize(cue.text)
        const slice = wordTimings.slice(timingCursor, timingCursor + cueWords.length)
        const actual = slice.map((word) => normalizeToken(word.text))
        if (actual.join(' ') !== cueWords.join(' ')) {
          throw new Error(`Voice timing mismatch at cue ${cue.id}. Expected “${cueWords.join(' ')}”; timing file has “${actual.join(' ')}”.`)
        }
        startMs = slice[0]?.startMs
        endMs = slice.at(-1)?.endMs
        timingCursor += cueWords.length
      }
      if (startMs == null || endMs == null) {
        throw new Error(`Cue ${cue.id} needs startMs/endMs, or the project voiceover needs an exact word-timings file.`)
      }
      if (endMs <= startMs) throw new Error(`Cue ${cue.id} must end after it starts.`)
      cues.push({
        id: cue.id,
        sceneId: scene.id,
        text: cue.text,
        displayText: cue.displayText,
        startMs,
        endMs,
        targets: cue.targets,
        effect: cue.effect,
        visualVerb: cue.visualVerb,
        settledState: cue.settledState,
      })
    }
  }
  if (wordTimings && timingCursor !== wordTimings.length) {
    throw new Error(`Narration cues cover ${timingCursor} timed words, but the timing file contains ${wordTimings.length}. Every spoken word must belong to exactly one visual cue.`)
  }
  if (cues.at(-1)!.endMs > audioDurationMs + 50) {
    throw new Error(`The final narration cue ends at ${cues.at(-1)!.endMs}ms, after the ${audioDurationMs}ms voiceover.`)
  }

  const sceneCueGroups = scenes.map((scene) => cues.filter((cue) => cue.sceneId === scene.id))
  const boundaries = [0]
  for (let index = 0; index < sceneCueGroups.length - 1; index += 1) {
    const currentEnd = sceneCueGroups[index].at(-1)!.endMs
    const nextStart = sceneCueGroups[index + 1][0].startMs
    boundaries.push(Math.round((currentEnd + nextStart) / 2))
  }
  boundaries.push(audioDurationMs)
  const timedScenes = scenes.map((scene, index) => ({
    id: scene.id,
    label: scene.label,
    teachingJob: scene.teachingJob,
    evidenceIds: scene.evidenceIds,
    layout: scene.layout,
    startMs: boundaries[index],
    durationMs: boundaries[index + 1] - boundaries[index],
    track: 0,
  }))
  const transcript = scenes.map((scene) => scene.narration).join(' ')
  const words = wordTimings ?? createSyntheticWordTimings(cues)
  return {
    durationMs: audioDurationMs,
    scenes: timedScenes,
    cues,
    words,
    narration: { transcript, audioDurationMs, cues },
  }
}

function buildProjectScript(
  scenes: Array<RuntimeSceneSource & { scriptSource: string }>,
  timedScenes: VideoComposition['scenes'],
  cues: VideoNarrationCue[],
  manualOverrides: VideoManualOverride[],
  captionGroups?: ReturnType<typeof buildCaptionGroups>,
  captionWords?: VideoWordTiming[],
) {
  const sceneData = scenes.map((scene, index) => ({
    id: scene.id,
    transition: scene.transition,
    startMs: timedScenes[index].startMs,
    durationMs: timedScenes[index].durationMs,
    cues: cues.filter((cue) => cue.sceneId === scene.id),
    overrides: manualOverrides.filter((override) => override.sceneId === scene.id),
  }))
  const captionData = captionGroups?.map((group) => ({
    ...group,
    words: (captionWords ?? []).slice(group.wordStart, group.wordEnd + 1),
  })) ?? []
  const renderers = scenes.map((scene) => [
    `/* html-video-scene-script:start ${scene.id} */`,
    `${JSON.stringify(scene.id)}:function(ctx){`,
    'var root=ctx.root,timeMs=ctx.timeMs,progress=ctx.progress,cue=ctx.cue,phase=ctx.phase,h=ctx.helpers,variables=ctx.variables;',
    scene.scriptSource,
    '}',
    `/* html-video-scene-script:end ${scene.id} */`,
  ].join('\n')).join(',\n')
  return String.raw`(function(){
var sceneData=${JSON.stringify(sceneData)};
var captionData=${JSON.stringify(captionData)};
var renderers={${renderers}};
function transitionProgress(localMs,durationMs){
  var enter=window.HtmlVideoRuntime.phase(localMs,0,Math.min(320,durationMs*0.12));
  var leave=1-window.HtmlVideoRuntime.phase(localMs,Math.max(0,durationMs-220),durationMs);
  return Math.min(enter,leave);
}
function applyTransition(el,type,p){
  var h=window.HtmlVideoRuntime;if(type==='cut'){el.style.opacity='1';el.style.transform='none';return;}var e=h.ease.outCubic(p);el.style.opacity=String(p);
  if(type==='push-left')el.style.transform='translate3d('+h.lerp(72,0,e)+'px,0,0)';
  else if(type==='push-up')el.style.transform='translate3d(0,'+h.lerp(58,0,e)+'px,0)';
  else if(type==='zoom')el.style.transform='scale('+h.lerp(.94,1,e)+')';
  else el.style.transform='none';
}
function applyCue(root,cue,p){
  var h=window.HtmlVideoRuntime,e=h.ease.outCubic(p);
  cue.targets.forEach(function(selector){
    var target=root.querySelector(selector);if(!target)return;
    target.style.setProperty('--cue-progress',String(p));target.setAttribute('data-cue-state',p<=0?'waiting':p>=1?'landed':'active');
    if(cue.effect==='none')return;
    if(cue.effect==='fade'){target.style.opacity=String(e);return;}
    if(cue.effect==='rise'){target.style.opacity=String(e);target.style.transform='translate3d(0,'+h.lerp(34,0,e)+'px,0)';return;}
    if(cue.effect==='scale'){target.style.opacity=String(e);target.style.transform='scale('+h.lerp(.86,1,e)+')';return;}
    if(cue.effect==='wipe'){target.style.opacity=String(e);target.style.clipPath='inset(0 '+(100-e*100)+'% 0 0)';return;}
    if(cue.effect==='draw')h.drawPath(target,e);
  });
}
function applyOverrides(root,overrides){
  overrides.forEach(function(item){
    var target=root.querySelector('[data-html-video-id="'+item.elementId+'"]');if(!target)return;
    Object.keys(item.properties).forEach(function(key){
      var value=item.properties[key];
      if(key==='text'){target.textContent=String(value==null?'':value);return;}
      if(key==='x')target.style.left=Number(value)+'px';
      else if(key==='y')target.style.top=Number(value)+'px';
      else if(key==='width'||key==='height'||key==='fontSize')target.style[key]=typeof value==='number'?value+'px':String(value);
      else if(key==='color'||key==='backgroundColor'||key==='opacity'||key==='zIndex')target.style[key]=String(value);
    });
  });
}
function renderCaption(root,timeMs){
  var line=root.querySelector('#hv-caption-line');if(!line)return;
  var group=captionData.find(function(item){return timeMs>=item.startMs&&timeMs<=item.endMs;});
  if(!group){line.textContent='';line.style.display='none';return;}
  line.style.display='block';line.innerHTML='';
  group.words.forEach(function(word,index){
    if(index)line.appendChild(document.createTextNode(' '));
    var span=document.createElement('span');span.className='hv-caption-word';span.textContent=word.text;
    span.setAttribute('data-active',timeMs>=word.startMs&&timeMs<=word.endMs?'true':'false');line.appendChild(span);
  });
}
window.__HTML_VIDEO__={renderFrame:function(ctx){
  sceneData.forEach(function(scene,index){
    var el=ctx.root.querySelector('#hv-scene-'+scene.id),last=index===sceneData.length-1;
    var active=ctx.timeMs>=scene.startMs&&(last?ctx.timeMs<=scene.startMs+scene.durationMs:ctx.timeMs<scene.startMs+scene.durationMs);
    el.setAttribute('aria-hidden',active?'false':'true');if(!active)return;
    var local=ctx.timeMs-scene.startMs,p=window.HtmlVideoRuntime.sceneProgress(ctx.timeMs,scene.startMs,scene.durationMs);
    applyTransition(el,scene.transition,transitionProgress(local,scene.durationMs));
    var cueValues={};scene.cues.forEach(function(item){var cp=window.HtmlVideoRuntime.phase(ctx.timeMs,item.startMs,item.endMs);cueValues[item.id]=cp;applyCue(el,item,cp);});
    applyOverrides(el,scene.overrides);
    renderers[scene.id]({root:el,timeMs:local,globalTimeMs:ctx.timeMs,progress:p,cue:function(id){return cueValues[id]||0;},phase:window.HtmlVideoRuntime.phase,helpers:window.HtmlVideoRuntime,variables:ctx.variables});
  });
  renderCaption(ctx.root,ctx.timeMs);
}};
})();`
}

function validateProjectIds(project: VideoProject) {
  for (const [kind, ids] of [
    ['scene', project.scenes.map((scene) => scene.id)],
    ['asset', project.assets.map((asset) => asset.id)],
    ['cue', project.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id))],
  ] as const) {
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
    if (duplicate) throw new Error(`Duplicate ${kind} id: ${duplicate}.`)
  }
}

function validateCueTargets(sceneId: string, html: string, cues: RuntimeCueSource[]) {
  const ids = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]))
  const semanticIds = new Set([...html.matchAll(/\bdata-html-video-id\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]))
  for (const cue of cues) {
    for (const target of cue.targets) {
      const idTarget = target.match(/^#(.+)$/)?.[1]
      const semanticTarget = target.match(/^\[data-html-video-id="([^"]+)"\]$/)?.[1]
      if (idTarget && ids.has(idTarget)) continue
      if (semanticTarget && semanticIds.has(semanticTarget)) continue
      throw new Error(`Cue ${cue.id} targets ${target}, but that stable target is not present in scene ${sceneId}.`)
    }
  }
}

function normalizeProjectScenes(project: VideoProject): RuntimeSceneSource[] {
  if (project.version === 1) {
    return project.scenes.map((scene) => ({
      ...scene,
      cues: scene.cues.map((cue) => ({ ...cue })),
    }))
  }
  return project.scenes.map((scene) => ({
    id: scene.id,
    label: scene.label,
    layout: scene.layout,
    html: scene.html,
    css: scene.css,
    script: scene.script,
    durationMs: scene.durationMs,
    narration: scene.spokenText,
    transition: scene.transition,
    teachingJob: scene.teachingJob,
    evidenceIds: scene.evidenceIds,
    cues: scene.cues.map((cue) => ({
      id: cue.id,
      text: cue.spokenText,
      displayText: cue.displayText,
      targets: cue.targets.map((target) => `[data-html-video-id="${target}"]`),
      effect: cue.effect,
      startMs: cue.startMs,
      endMs: cue.endMs,
      visualVerb: cue.visualVerb,
      settledState: cue.settledState,
    })),
  }))
}

function parseWordTimings(value: unknown): WordTiming[] {
  const raw = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { words?: unknown }).words)
    ? (value as { words: unknown[] }).words
    : undefined
  if (!raw) throw new Error('Word timings must be an array, or an object with a words array.')
  const output: WordTiming[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') throw new Error('Every word timing must be an object.')
    const item = entry as Record<string, unknown>
    const text = String(item.text ?? item.word ?? '')
    const startMs = numberTime(item.startMs, item.start)
    const endMs = numberTime(item.endMs, item.end)
    const tokens = rawTokens(text)
    if (!tokens.length || startMs == null || endMs == null || endMs <= startMs) throw new Error(`Invalid word timing: ${JSON.stringify(entry)}`)
    for (const token of tokens) output.push({ index: output.length, text: token, startMs, endMs })
  }
  for (let index = 1; index < output.length; index += 1) {
    if (output[index].startMs < output[index - 1].startMs) throw new Error('Word timings must be chronological.')
  }
  return output
}

function createSyntheticWordTimings(cues: VideoNarrationCue[]): VideoWordTiming[] {
  const output: VideoWordTiming[] = []
  for (const cue of cues) {
    const words = cue.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
    const duration = Math.max(1, cue.endMs - cue.startMs)
    words.forEach((word, index) => {
      const startMs = cue.startMs + Math.round(duration * index / words.length)
      const endMs = cue.startMs + Math.round(duration * (index + 1) / words.length)
      output.push({ index: output.length, text: word, startMs, endMs })
    })
  }
  return output
}

function numberTime(milliseconds: unknown, seconds: unknown) {
  if (typeof milliseconds === 'number' && Number.isFinite(milliseconds)) return Math.round(milliseconds)
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000)
  return undefined
}

function tokenize(text: string): string[] {
  return rawTokens(text).map(normalizeToken)
}

function rawTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
}

function normalizeToken(value: string) {
  return value.toLocaleLowerCase('en-US').replace(/’/g, "'")
}

async function readProjectText(root: string, path: string) {
  return readFile(resolveProjectPath(root, path), 'utf8')
}

function resolveProjectPath(root: string, path: string) {
  if (isAbsolute(path)) throw new Error(`Project paths must be relative: ${path}`)
  const resolved = resolve(root, path)
  const rel = relative(root, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Project path escapes its root: ${path}`)
  return resolved
}

function inferMimeType(path: string, kind: VideoProject['assets'][number]['kind']) {
  const extension = extname(path).toLowerCase()
  const known: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  }
  return known[extension] ?? `${kind}/octet-stream`
}

async function probeAudioDurationMs(path: string) {
  const ffmpegPath = resolveFfmpegPath()
  const result = await new Promise<{ code: number | null, stderr: string }>((resolvePromise, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', path, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code) => resolvePromise({ code, stderr }))
  })
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) throw new Error(`Could not read voiceover duration from ${path}.`)
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000)
}

function isProjectValue(value: unknown): value is VideoProject {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'html-video-project')
}
