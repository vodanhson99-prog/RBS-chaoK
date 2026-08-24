import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBoothConfig, parseSessionHeaders } from '../src/domain/booth.mjs'

test('buildBoothConfig exposes gesture-s defaults', () => {
  const config = buildBoothConfig({
    defaultTemplateId: 'blue',
    defaultTemplateVersion: 1,
    captureMode: 'gesture-s',
    gestureHoldMs: 950,
    countdownSeconds: 3,
    poseGraceMs: 2500,
    gestureMinConfidence: 0.78,
    gestureConsecutiveFrames: 4,
    showFrameLibrary: false,
  })
  assert.equal(config.captureMode, 'gesture-s')
  assert.equal(config.features.cornerPin, false)
  assert.equal(config.defaultTemplateId, 'blue')
  assert.equal(config.gesture.holdMs, 950)
  assert.equal(config.gesture.countdownSeconds, 3)
  assert.equal(config.gesture.minConfidence, 0.78)
  assert.equal(config.gesture.consecutiveFrames, 4)
})

test('parseSessionHeaders normalizes upload metadata', () => {
  assert.deepEqual(
    parseSessionHeaders({
      'x-template-id': 'woozi',
      'x-template-version': '1',
      'x-capture-mode': 'gesture-s',
    }),
    {
      templateId: 'woozi',
      templateVersion: 1,
      captureMode: 'gesture-s',
    },
  )
  assert.deepEqual(parseSessionHeaders({}), {
    templateId: null,
    templateVersion: null,
    captureMode: null,
  })
})
