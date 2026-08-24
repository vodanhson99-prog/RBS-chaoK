import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidToken, validateJpeg } from '../src/domain/media.mjs'

test('validates JPEG and PNG signatures against content type', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(32).fill(0)])
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(32).fill(0)])
  assert.equal(validateJpeg(jpeg, 'image/jpeg', 1024).ok, true)
  assert.equal(validateJpeg(png, 'image/png', 1024).ok, true)
  assert.equal(validateJpeg(jpeg, 'image/png', 1024).ok, false)
})

test('rejects oversized media and unsafe tokens', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, ...new Array(32).fill(0)])
  assert.equal(validateJpeg(jpeg, 'image/jpeg', 16).code, 'MEDIA_TOO_LARGE')
  assert.equal(isValidToken('short'), false)
  assert.equal(isValidToken('../escape'), false)
  assert.equal(isValidToken('valid_token-123456'), true)
})
