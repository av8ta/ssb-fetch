const test = require('ava')
const { convertLegacySSB } = require('..')

test('convert message sigil to ssb url', t => {
  const id = '%Aul3TnNcufZ/ttuwyuTjzQ0XiuBBEIqGdll+yujx54I=.sha256'
  const url = 'ssb://message/sha256/Aul3TnNcufZ_ttuwyuTjzQ0XiuBBEIqGdll-yujx54I='

  t.is(convertLegacySSB(id), url)
})

test('convert blob sigil to ssb url', t => {
  const id = '&Aul3TnNcufZ/ttuwyuTjzQ0XiuBBEIqGdll+yujx54I=.sha256'
  const url = 'ssb://blob/sha256/Aul3TnNcufZ_ttuwyuTjzQ0XiuBBEIqGdll-yujx54I='

  t.is(convertLegacySSB(id), url)
})

test('convert feed sigil to ssb url', t => {
  const id = '@AeqHNwjCn9Spob2u+kfYTHmNQDE//6g6tAwkXgJNm2E=.ed25519'
  const url = 'ssb://feed/ed25519/AeqHNwjCn9Spob2u-kfYTHmNQDE__6g6tAwkXgJNm2E='

  t.is(convertLegacySSB(id), url)
})
