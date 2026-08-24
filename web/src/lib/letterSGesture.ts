import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'

export type HandLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
  presence?: number
}

type FingerName = 'index' | 'middle' | 'ring' | 'pinky'

type FingerAngles = {
  pip: number
  dip: number
}

export type LetterSAnalysis = {
  score: number
  pass: boolean
  minConfidence: number
  rejectReason: string | null
  fingers: Record<FingerName, number>
  fingerAngles: Record<FingerName, FingerAngles>
  curlScore: number
  minFingerCurl: number
  thumbScore: number
  thumbTucked: boolean
  thumbExtended: boolean
  indexExtended: boolean
  middleExtended: boolean
  palmWidth: number
  palmScale: number
  fullHandScale: number
  thumbFeatures: {
    toIndexPip: number
    toIndexDip: number
    toMiddlePip: number
    toMiddleDip: number
  }
  palmPitchDeg: number
  palmNormal: HandLandmark
  wristToMiddleDy: number
  wristToMiddleDz: number
  handSource: 'world' | 'image'
  cShapeScore: number
  cHardRulesPassed: boolean
  centerX: number
  centerY: number
  openingGap: number
  orientationDeg: number
  openingDirection: 'left' | 'right' | 'unknown'
  mouthMidpoint: HandLandmark
  palmCenter: HandLandmark
}

export type LetterSHandCandidate = {
  index: number
  imageLandmarks: HandLandmark[]
  worldLandmarks: HandLandmark[] | null
  handedness: string | null
  analysis: LetterSAnalysis
}

export type LetterSPairAnalysis = {
  score: number
  pairScore: number
  pass: boolean
  minConfidence: number
  rejectReason: string | null
  handCount: number
  upperHandIndex: number | null
  lowerHandIndex: number | null
  upperC: number
  lowerC: number
  dx: number
  dy: number
  oppositeOrientation: boolean
  orientationScore: number
  distanceScore: number
  silhouetteScore: number
  hardRulesPassed: boolean
}

const FINGER_JOINTS: Record<FingerName, [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function sub(a: HandLandmark, b: HandLandmark): HandLandmark {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  }
}

function add(a: HandLandmark, b: HandLandmark): HandLandmark {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) }
}

function scale(vector: HandLandmark, amount: number): HandLandmark {
  return { x: vector.x * amount, y: vector.y * amount, z: (vector.z ?? 0) * amount }
}

function dot(a: HandLandmark, b: HandLandmark): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0)
}

function length(vector: HandLandmark): number {
  return Math.hypot(vector.x, vector.y, vector.z ?? 0)
}

function distance3(a: HandLandmark, b: HandLandmark): number {
  return length(sub(a, b))
}

function angleDeg(a: HandLandmark, b: HandLandmark, c: HandLandmark): number {
  const ba = sub(a, b)
  const bc = sub(c, b)
  const denominator = length(ba) * length(bc)
  if (denominator < 1e-8) return 180

  const cosine = Math.max(-1, Math.min(1, dot(ba, bc) / denominator))
  return (Math.acos(cosine) * 180) / Math.PI
}

function inverseRamp(value: number, curled: number, straight: number): number {
  return clamp01(1 - (value - curled) / (straight - curled))
}

function bandScore(value: number, idealMin: number, idealMax: number, hardMin: number, hardMax: number): number {
  if (value < hardMin || value > hardMax) return 0
  if (value < idealMin) return clamp01((value - hardMin) / (idealMin - hardMin))
  if (value > idealMax) return clamp01((hardMax - value) / (hardMax - idealMax))
  return 1
}

function isUsableWorldLandmarks(landmarks: HandLandmark[] | undefined): landmarks is HandLandmark[] {
  return Boolean(landmarks && landmarks.length >= 21 && landmarks.every((landmark) => Number.isFinite(landmark.z)))
}

function cross(a: HandLandmark, b: HandLandmark): HandLandmark {
  return {
    x: a.y * (b.z ?? 0) - (a.z ?? 0) * b.y,
    y: (a.z ?? 0) * b.x - a.x * (b.z ?? 0),
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(vector: HandLandmark): HandLandmark {
  const size = length(vector) || 1
  return { x: vector.x / size, y: vector.y / size, z: (vector.z ?? 0) / size }
}

function palmNormal(landmarks: HandLandmark[]): HandLandmark {
  return normalize(cross(sub(landmarks[5], landmarks[0]), sub(landmarks[17], landmarks[0])))
}

function estimatePalmPitchDeg(normal: HandLandmark): number {
  return (Math.atan2(Math.hypot(normal.x, normal.y), Math.abs(normal.z ?? 0)) * 180) / Math.PI
}

function fingerCurl3D(
  landmarks: HandLandmark[],
  mcp: number,
  pip: number,
  dip: number,
  tip: number,
): { score: number; angles: FingerAngles } {
  const pipAngle = angleDeg(landmarks[mcp], landmarks[pip], landmarks[dip])
  const dipAngle = angleDeg(landmarks[pip], landmarks[dip], landmarks[tip])
  const pipCurl = inverseRamp(pipAngle, 100, 165)
  const dipCurl = inverseRamp(dipAngle, 105, 170)
  return {
    score: clamp01(pipCurl * 0.7 + dipCurl * 0.3),
    angles: { pip: pipAngle, dip: dipAngle },
  }
}

function resolveArguments(
  minConfidenceOrWorld: number | HandLandmark[] | undefined,
  maybeWorldOrConfidence: HandLandmark[] | number | undefined,
): { minConfidence: number; worldLandmarks: HandLandmark[] | undefined } {
  let minConfidence = 0.78
  let worldLandmarks: HandLandmark[] | undefined

  if (typeof minConfidenceOrWorld === 'number') minConfidence = minConfidenceOrWorld
  else if (Array.isArray(minConfidenceOrWorld)) worldLandmarks = minConfidenceOrWorld

  if (typeof maybeWorldOrConfidence === 'number') minConfidence = maybeWorldOrConfidence
  else if (Array.isArray(maybeWorldOrConfidence)) worldLandmarks = maybeWorldOrConfidence

  return { minConfidence, worldLandmarks }
}

function emptyAnalysis(minConfidence: number): LetterSAnalysis {
  const zeroFingers = { index: 0, middle: 0, ring: 0, pinky: 0 }
  const zeroAngles = {
    index: { pip: 180, dip: 180 },
    middle: { pip: 180, dip: 180 },
    ring: { pip: 180, dip: 180 },
    pinky: { pip: 180, dip: 180 },
  }
  return {
    score: 0,
    pass: false,
    minConfidence,
    rejectReason: 'no hand / landmarks',
    fingers: zeroFingers,
    fingerAngles: zeroAngles,
    curlScore: 0,
    minFingerCurl: 0,
    thumbScore: 0,
    thumbTucked: false,
    thumbExtended: false,
    indexExtended: false,
    middleExtended: false,
    palmWidth: 0,
    palmScale: 0,
    fullHandScale: 0,
    thumbFeatures: { toIndexPip: 0, toIndexDip: 0, toMiddlePip: 0, toMiddleDip: 0 },
    palmPitchDeg: 0,
    palmNormal: { x: 0, y: 0, z: 0 },
    wristToMiddleDy: 0,
    wristToMiddleDz: 0,
    handSource: 'image',
    cShapeScore: 0,
    cHardRulesPassed: false,
    centerX: 0,
    centerY: 0,
    openingGap: 0,
    orientationDeg: 0,
    openingDirection: 'unknown',
    mouthMidpoint: { x: 0, y: 0, z: 0 },
    palmCenter: { x: 0, y: 0, z: 0 },
  }
}

function emptyPairAnalysis(minConfidence: number, handCount = 0): LetterSPairAnalysis {
  return {
    score: 0,
    pairScore: 0,
    pass: false,
    minConfidence,
    rejectReason: handCount < 2 ? 'need at least 2 hands' : 'no valid C pair',
    handCount,
    upperHandIndex: null,
    lowerHandIndex: null,
    upperC: 0,
    lowerC: 0,
    dx: 0,
    dy: 0,
    oppositeOrientation: false,
    orientationScore: 0,
    distanceScore: 0,
    silhouetteScore: 0,
    hardRulesPassed: false,
  }
}

function averageLandmarks(landmarks: HandLandmark[]): HandLandmark {
  return scale(
    landmarks.reduce((sum, landmark) => add(sum, landmark), { x: 0, y: 0, z: 0 }),
    1 / Math.max(1, landmarks.length),
  )
}

function boundingBoxDiagonal(landmarks: HandLandmark[]): number {
  const xs = landmarks.map((landmark) => landmark.x)
  const ys = landmarks.map((landmark) => landmark.y)
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

/**
 * Analyze one hand as a C shape. This deliberately does not classify a full S;
 * the S decision is made by analyzeLetterSPair using two C candidates.
 */
export function analyzeLetterSGesture(
  imageLandmarks: HandLandmark[],
  worldLandmarks?: HandLandmark[],
  minConfidence?: number,
): LetterSAnalysis
export function analyzeLetterSGesture(
  imageLandmarks: HandLandmark[],
  minConfidence?: number,
  worldLandmarks?: HandLandmark[],
): LetterSAnalysis
export function analyzeLetterSGesture(
  imageLandmarks: HandLandmark[],
  minConfidenceOrWorld: number | HandLandmark[] = 0.78,
  maybeWorldOrConfidence?: HandLandmark[] | number,
): LetterSAnalysis {
  const { minConfidence, worldLandmarks } = resolveArguments(minConfidenceOrWorld, maybeWorldOrConfidence)
  const empty = emptyAnalysis(minConfidence)
  if (imageLandmarks.length < 21) return empty

  const useWorld = isUsableWorldLandmarks(worldLandmarks)
  const pose = useWorld ? worldLandmarks : imageLandmarks
  const source: 'world' | 'image' = useWorld ? 'world' : 'image'
  const normal = palmNormal(pose)
  const palmScale = distance3(pose[5], pose[17])
  const palmWidth = Math.hypot(imageLandmarks[5].x - imageLandmarks[17].x, imageLandmarks[5].y - imageLandmarks[17].y)
  const palmCenter = averageLandmarks([imageLandmarks[0], imageLandmarks[5], imageLandmarks[9], imageLandmarks[13], imageLandmarks[17]])
  const fullHandScale = boundingBoxDiagonal(imageLandmarks)

  if (palmScale < 1e-6 || palmWidth < 0.025 || fullHandScale < 0.05) {
    return {
      ...empty,
      rejectReason: 'palm too small in frame',
      palmWidth,
      palmScale,
      fullHandScale,
      palmNormal: normal,
      palmPitchDeg: estimatePalmPitchDeg(normal),
      centerX: palmCenter.x,
      centerY: palmCenter.y,
      palmCenter,
      handSource: source,
    }
  }

  const fingers = {} as Record<FingerName, number>
  const fingerAngles = {} as Record<FingerName, FingerAngles>
  for (const [name, [mcp, pip, dip, tip]] of Object.entries(FINGER_JOINTS) as [FingerName, [number, number, number, number]][]) {
    const result = fingerCurl3D(pose, mcp, pip, dip, tip)
    fingers[name] = result.score
    fingerAngles[name] = result.angles
  }

  const curlScore = (fingers.index + fingers.middle + fingers.ring + fingers.pinky) / 4
  const minFingerCurl = Math.min(fingers.index, fingers.middle, fingers.ring, fingers.pinky)
  const indexExtended = fingers.index < 0.35
  const middleExtended = fingers.middle < 0.35

  const thumbFeatures = {
    toIndexPip: distance3(pose[4], pose[6]) / palmScale,
    toIndexDip: distance3(pose[4], pose[7]) / palmScale,
    toMiddlePip: distance3(pose[4], pose[10]) / palmScale,
    toMiddleDip: distance3(pose[4], pose[11]) / palmScale,
  }
  const nearestThumbDistance = Math.min(...Object.values(thumbFeatures))
  const thumbTucked = nearestThumbDistance <= 0.65

  const fingerTips = averageLandmarks([imageLandmarks[8], imageLandmarks[12]])
  const mouthMidpoint = averageLandmarks([imageLandmarks[4], fingerTips])
  const mouthToPalm = sub(palmCenter, mouthMidpoint)
  const mouthToPalm2d = normalize({ x: mouthToPalm.x, y: mouthToPalm.y, z: 0 })
  const openingGap = distance3(mouthMidpoint, palmCenter) / Math.max(fullHandScale, 1e-6)
  const thumbGapScore = bandScore(openingGap, 0.35, 2.55, 0.12, 3.8)
  const curveScore = bandScore(curlScore, 0.2, 0.82, 0.05, 0.98)
  const tipToPalm = [8, 12, 16, 20].reduce((sum, index) => sum + distance3(imageLandmarks[index], palmCenter), 0) / (4 * Math.max(fullHandScale, 1e-6))
  const curveDepthScore = bandScore(tipToPalm, 0.22, 0.65, 0.08, 1.1)
  const cShapeScore = clamp01(curveScore * 0.45 + curveDepthScore * 0.25 + thumbGapScore * 0.3)
  const cHardRulesPassed =
    minFingerCurl >= 0.1 &&
    curlScore <= 0.96 &&
    openingGap >= 0.12 &&
    openingGap <= 3.8 &&
    cShapeScore >= 0.34
  const thumbExtended = openingGap > 1.75
  const orientationDeg = (Math.atan2(mouthToPalm2d.y, mouthToPalm2d.x) * 180) / Math.PI
  const openingDirection = Math.abs(mouthToPalm2d.x) < 0.15 ? 'unknown' : mouthToPalm2d.x < 0 ? 'left' : 'right'
  const rejectReason =
    minFingerCurl < 0.1
      ? 'C fingers too open'
      : curlScore > 0.96
        ? 'C fingers too closed'
        : openingGap < 0.12 || openingGap > 3.8
          ? 'C opening is invalid'
          : !cHardRulesPassed
            ? 'C shape below threshold'
            : cShapeScore >= minConfidence
              ? null
              : 'C score below threshold'

  return {
    score: cShapeScore,
    pass: cHardRulesPassed && cShapeScore >= minConfidence,
    minConfidence,
    rejectReason,
    fingers,
    fingerAngles,
    curlScore,
    minFingerCurl,
    thumbScore: thumbGapScore,
    thumbTucked,
    thumbExtended,
    indexExtended,
    middleExtended,
    palmWidth,
    palmScale,
    fullHandScale,
    thumbFeatures,
    palmPitchDeg: estimatePalmPitchDeg(normal),
    palmNormal: normal,
    wristToMiddleDy: imageLandmarks[9].y - imageLandmarks[0].y,
    wristToMiddleDz: (imageLandmarks[9].z ?? 0) - (imageLandmarks[0].z ?? 0),
    handSource: source,
    cShapeScore,
    cHardRulesPassed,
    centerX: palmCenter.x,
    centerY: palmCenter.y,
    openingGap,
    orientationDeg,
    openingDirection,
    mouthMidpoint,
    palmCenter,
  }
}

export function analyzeLetterSResult(
  result: GestureRecognizerResult,
  minConfidence = 0.78,
): LetterSHandCandidate[] {
  return result.landmarks.map((imageLandmarks, index) => ({
    index,
    imageLandmarks,
    worldLandmarks: isUsableWorldLandmarks(result.worldLandmarks?.[index]) ? result.worldLandmarks[index] : null,
    handedness: result.handedness?.[index]?.[0]?.categoryName ?? null,
    analysis: analyzeLetterSGesture(
      imageLandmarks,
      minConfidence,
      result.worldLandmarks?.[index],
    ),
  }))
}

function pairAnalysisFor(
  upper: LetterSHandCandidate,
  lower: LetterSHandCandidate,
  handCount: number,
  minConfidence: number,
): LetterSPairAnalysis {
  const upperScale = Math.max(upper.analysis.fullHandScale, 1e-6)
  const lowerScale = Math.max(lower.analysis.fullHandScale, 1e-6)
  const handScale = (upperScale + lowerScale) / 2
  const dx = Math.abs(lower.analysis.centerX - upper.analysis.centerX) / handScale
  const dy = Math.abs(lower.analysis.centerY - upper.analysis.centerY) / handScale
  const verticalDelta = lower.analysis.centerY - upper.analysis.centerY
  const verticalOrder = verticalDelta > handScale * 0.12
  const upperDirection = upper.analysis.openingDirection
  const lowerDirection = lower.analysis.openingDirection
  const oppositeOrientation =
    upperDirection !== 'unknown' &&
    lowerDirection !== 'unknown' &&
    upperDirection !== lowerDirection
  const orientationScore = oppositeOrientation ? 1 : 0
  const dxScore = bandScore(dx, 0.35, 2.4, 0, 4.4)
  const dyScore = bandScore(dy, 0.45, 3.8, 0.12, 5.8)
  const distanceScore = clamp01(dxScore * 0.42 + dyScore * 0.58)
  const silhouetteScore = clamp01(distanceScore * 0.58 + orientationScore * 0.42)
  const hardRulesPassed =
    upper.analysis.cHardRulesPassed &&
    lower.analysis.cHardRulesPassed &&
    verticalOrder &&
    oppositeOrientation &&
    dx <= 4.4 &&
    dy >= 0.12 &&
    dy <= 5.8 &&
    silhouetteScore >= 0.35
  const pairScore = clamp01(
    ((upper.analysis.cShapeScore + lower.analysis.cShapeScore) / 2) * 0.46 +
      orientationScore * 0.24 +
      distanceScore * 0.18 +
      silhouetteScore * 0.12,
  )
  const rejectReason =
    !upper.analysis.cHardRulesPassed
      ? `upper hand is not C: ${upper.analysis.rejectReason ?? 'invalid C'}`
      : !lower.analysis.cHardRulesPassed
        ? `lower hand is not C: ${lower.analysis.rejectReason ?? 'invalid C'}`
        : !verticalOrder
          ? 'upper/lower order is invalid'
          : !oppositeOrientation
            ? 'hands are not opposite orientation'
            : dx > 4.4 || dy < 0.12 || dy > 5.8
              ? 'hand distance is out of range'
              : silhouetteScore < 0.35
                ? 'C pair does not form an S silhouette'
                : pairScore >= minConfidence
                  ? null
                  : 'pair score below threshold'

  return {
    score: pairScore,
    pairScore,
    pass: hardRulesPassed && pairScore >= minConfidence,
    minConfidence,
    rejectReason,
    handCount,
    upperHandIndex: upper.index,
    lowerHandIndex: lower.index,
    upperC: upper.analysis.cShapeScore,
    lowerC: lower.analysis.cShapeScore,
    dx,
    dy,
    oppositeOrientation,
    orientationScore,
    distanceScore,
    silhouetteScore,
    hardRulesPassed,
  }
}

export function analyzeLetterSPair(
  candidates: LetterSHandCandidate[],
  minConfidence = 0.78,
): LetterSPairAnalysis {
  if (candidates.length < 2) return emptyPairAnalysis(minConfidence, candidates.length)

  let best: LetterSPairAnalysis | null = null
  for (let first = 0; first < candidates.length - 1; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      const firstCandidate = candidates[first]
      const secondCandidate = candidates[second]
      const pair =
        firstCandidate.analysis.centerY <= secondCandidate.analysis.centerY
          ? pairAnalysisFor(firstCandidate, secondCandidate, candidates.length, minConfidence)
          : pairAnalysisFor(secondCandidate, firstCandidate, candidates.length, minConfidence)
      if (!best || pair.pairScore > best.pairScore) best = pair
    }
  }

  return best ?? emptyPairAnalysis(minConfidence, candidates.length)
}

export function scoreLetterSGesture(
  imageLandmarks: HandLandmark[],
  worldLandmarks?: HandLandmark[],
): number {
  return analyzeLetterSGesture(imageLandmarks, worldLandmarks).score
}

export function isLetterSGesture(
  imageLandmarks: HandLandmark[],
  minConfidence = 0.78,
  worldLandmarks?: HandLandmark[],
): boolean {
  return analyzeLetterSGesture(imageLandmarks, minConfidence, worldLandmarks).pass
}

export function detectLetterS(result: GestureRecognizerResult, minConfidence = 0.78): boolean {
  const candidates = analyzeLetterSResult(result, minConfidence)
  if (candidates.length < 2) return false
  return analyzeLetterSPair(candidates, minConfidence).pass
}

export function createLetterSStreakGate(consecutiveFrames: number) {
  let streak = 0
  const required = Math.max(1, Math.round(consecutiveFrames))
  return {
    update(rawIsS: boolean): boolean {
      if (rawIsS) streak += 1
      else streak = 0
      return streak >= required
    },
    reset(): void {
      streak = 0
    },
    get streak(): number {
      return streak
    },
  }
}

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
]
