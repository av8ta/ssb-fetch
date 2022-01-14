const test = require('ava')
const { makeSsbFetch } = require('./')
const { convertLegacySSB } = require('./uri')

function publish(sbot, content) {
  return new Promise((resolve, reject) => {
    sbot.publish(content, (error, msg) => {
      if (error) reject(error)
      else resolve(msg.key)
    })
  })
}

function Server(options = {}) {
  return new Promise(resolve => {
    const stack = require('scuttle-testbot')
    // .use(require('..'))
    resolve(stack(options))
  })
}

test('convert message sigil to ssb url', t => {
  const id = '%Aul3TnNcufZ/ttuwyuTjzQ0XiuBBEIqGdll+yujx54I=.sha256'
  const url =
    'ssb://message/sha256/Aul3TnNcufZ_ttuwyuTjzQ0XiuBBEIqGdll-yujx54I='

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

test.serial('fetch message json', async t => {
  const sbot = await Server()
  const fetch = makeSsbFetch({ sbot })

  const messageId = await publish(sbot, {
    type: 'post',
    text: '# [@bob] wrote a test message'
  })

  const response = await fetch(convertLegacySSB(messageId))
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(fetchedMessage.value.content.text, '# [@bob] wrote a test message')
})
