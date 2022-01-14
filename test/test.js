const test = require('ava')
const { makeSsbFetch, convertLegacySSB } = require('../')
const file = require('pull-file')
const pull = require('pull-stream')
const path = require('path')
const hash = require('hash.js')

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
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.value.content.text, '# [@bob] wrote a test message')
})

test.serial('fetch a text blob', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './blob.txt'))

  const fetch = makeSsbFetch({ sbot })
  const response = await fetch(convertLegacySSB(blobId))
  const contentType = response.headers.get('content-type')
  const content = await response.text()

  t.is(response.status, 200)
  t.is(contentType, 'application/octet-stream')
  t.is(content, 'a test blob')
})

test.serial('fetch a text blob & check hash', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './blob.txt'))
  const blobHash = 'dv9s1G2Gj20auA3GHE2HIYomHSrsl6To7Qd9dWJMHmE='

  const fetch = makeSsbFetch({ sbot })
  const response = await fetch(convertLegacySSB(blobId))
  const content = await response.text()

  const hex = hash.sha256().update(content).digest('hex')
  const buff = Buffer.from(hex, 'hex')

  t.is(response.status, 200)
  t.is(buff.toString('base64'), blobHash)
})

test.serial('fetch a gif blob', async t => {
  const sbot = await Server()
  const blobId = await addBlob(
    sbot,
    path.join(__dirname, './agregore-demo-2.gif')
  )

  const fetch = makeSsbFetch({ sbot })
  const response = await fetch(convertLegacySSB(blobId))
  const contentType = response.headers.get('content-type')

  t.is(response.status, 200)
  t.is(contentType, 'image/gif')
})

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
    const stack = require('scuttle-testbot').use(require('ssb-blobs'))
    resolve(stack(options))
  })
}

function addBlob(sbot, filePath) {
  return new Promise((resolve, reject) => {
    pull(
      file(filePath),
      sbot.blobs.add((error, blobId) => {
        if (error) reject(error)
        else resolve(blobId)
      })
    )
  })
}
