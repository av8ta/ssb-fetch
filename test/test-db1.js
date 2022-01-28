const test = require('ava')
const { makeSsbFetch, convertLegacySSB } = require('..')
const path = require('path')
const hash = require('hash.js')
const { promisify } = require('util')
const { Server, publish, addBlob } = require('./ssb')

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
  const blobId = await addBlob(sbot, path.join(__dirname, './agregore-demo-2.gif'))

  const fetch = makeSsbFetch({ sbot })
  const response = await fetch(convertLegacySSB(blobId))
  const contentType = response.headers.get('content-type')

  t.is(response.status, 200)
  t.is(contentType, 'image/gif')
})

test.serial('fetch about message json', async t => {
  const sbot = await Server({ about: true, backlinks: true })
  const fetch = makeSsbFetch({ sbot })
  const whoami = promisify(sbot.whoami)
  const author = await whoami()

  await publish(sbot, {
    type: 'about',
    about: author.id,
    name: 'bob'
  })

  const response = await fetch(convertLegacySSB(author.id))
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.name, 'bob')
})

test.serial('fetch feed name, location, description via about messages', async t => {
  const sbot = await Server({ about: true, backlinks: true })
  const fetch = makeSsbFetch({ sbot })
  const whoami = promisify(sbot.whoami)

  const author = await whoami()
  await publish(sbot, {
    type: 'about',
    about: author.id,
    name: 'bob',
    description: 'builder of tools'
  })
  await publish(sbot, {
    type: 'about',
    about: author.id,
    location: 'earth'
  })
  await publish(sbot, {
    type: 'about',
    about: author.id,
    name: 'robert'
  })

  const feedUrl = convertLegacySSB(author.id)
  const response = await fetch(feedUrl)
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.name, 'robert')
  t.is(fetchedMessage.location, 'earth')
  t.is(fetchedMessage.description, 'builder of tools')
})

test.serial('fetch feed image link from string via about messages', async t => {
  const sbot = await Server({ about: true, backlinks: true })
  const fetch = makeSsbFetch({ sbot })
  const whoami = promisify(sbot.whoami)

  const author = await whoami()

  await publish(sbot, {
    type: 'about',
    about: author.id,
    name: 'bob',
    image: '&an-image-blob-on-image-key.sha256'
  })

  const feedUrl = convertLegacySSB(author.id)
  const response = await fetch(feedUrl)
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.image.link, '&an-image-blob-on-image-key.sha256')
})

test.serial('fetch feed image link from object via about messages', async t => {
  const sbot = await Server({ about: true, backlinks: true })
  const fetch = makeSsbFetch({ sbot })
  const whoami = promisify(sbot.whoami)

  const author = await whoami()

  await publish(sbot, {
    type: 'about',
    about: author.id,
    name: 'bob',
    image: {
      link: '&an-image-blob-on-link-key.sha256',
      size: 100000,
      type: 'image/png',
      width: 600,
      height: 600
    }
  })

  const feedUrl = convertLegacySSB(author.id)
  const response = await fetch(feedUrl)
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.image.link, '&an-image-blob-on-link-key.sha256')
})
