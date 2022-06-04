const test = require('ava')
const { makeSsbFetch, convertLegacySSB } = require('..')
const path = require('path')
const hash = require('hash.js')
const { promisify } = require('util')
const { Server, publish, addBlob } = require('./ssb')


let printHeaders = (testName, response) => {
  for (let [key, value] of response.headers.entries()) {
    console.log(testName + ': ', key + ': ' + value)
  }
}

test.serial('fetch message json', async t => {
  const sbot = await Server()
  const fetch = makeSsbFetch({ sbot })

  const messageId = await publish(sbot, {
    type: 'post',
    text: '# [@bob] wrote a test message'
  })

  // console.log('message id', messageId)

  const response = await fetch(convertLegacySSB(messageId))
  const contentType = response.headers.get('content-type')
  const fetchedMessage = await response.json()

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(fetchedMessage.value.content.text, '# [@bob] wrote a test message')
  t.truthy(!sbot.db2migrate)
})

test.serial('HEAD request of a json message returns Content-Length', async t => {
  const sbot = await Server()
  const fetch = makeSsbFetch({ sbot })

  const messageId = await publish(sbot, {
    type: 'post',
    text: '# [@bob] wrote a test message'
  })

  const response = await fetch(convertLegacySSB(messageId), { method: 'HEAD' })
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.truthy(!sbot.db2migrate)

  /**
   * bytes returned are either 414 or 418
   * presumably the timestamp difference in the message
   * sometimes timestamps are 1234.123 instead of 1234
   * that's likely the difference - certainly the test returns the correct data!
   */
  const try414 = await t.try(tt => {
    tt.is(contentLength, '414')
  })
  const try418 = await t.try(tt => {
    tt.is(contentLength, '418')
  })
  if (!(try414.passed || try418.passed)) {
    throw new Error('message size was neither 414 or 418 bytes')
  } else {
    if (try414.passed) try414.commit()
    else try414.discard()
    if (try418.passed) try418.commit()
    else try418.discard()
  }
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
  t.truthy(!sbot.db2migrate)
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
  t.truthy(!sbot.db2migrate)
})

test.serial('fetch a text blob range', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './blob.txt'))
  const fetch = makeSsbFetch({ sbot })
  // "a test blob" => "a test"
  const headers = {
    Range: 'bytes=0-6'
  }
  const response = await fetch(convertLegacySSB(blobId), { headers })
  const content = await response.text()
  const contentType = response.headers.get('content-type')

  t.is(response.status, 206)
  t.is(contentType, 'application/octet-stream')
  t.is(content, 'a test')
  t.truthy(!sbot.db2migrate)
})

test.serial('fetch a text blob multirange', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './blob.txt'))
  const fetch = makeSsbFetch({ sbot })
  // "a test blob" => "at blob"
  const headers = {
    Range: 'bytes=0-1, 2-3, 1-2, 7-11'
  }
  const response = await fetch(convertLegacySSB(blobId), { headers })
  const content = await response.text()
  const contentType = response.headers.get('content-type')

  t.is(response.status, 206)
  t.is(contentType, 'application/octet-stream')
  t.is(content, 'at blob')
  t.truthy(!sbot.db2migrate)
})

test.serial('HEAD request of a text blob multirange returns Content-Length', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './blob.txt'))
  const fetch = makeSsbFetch({ sbot })
  // "a test blob" => "at blob"
  const headers = {
    Range: 'bytes=0-1, 2-3, 1-2, 7-11'
  }
  const response = await fetch(convertLegacySSB(blobId), { method: 'HEAD', headers })
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')

  // const testName = 'HEAD request of a text blob multirange returns Content-Length'
  // printHeaders(testName, response)

  t.is(response.status, 206)
  t.is(contentType, 'application/octet-stream')
  t.is(contentLength, '7')
  t.truthy(!sbot.db2migrate)
})

test.serial('fetch a gif blob', async t => {
  const sbot = await Server()
  const blobId = await addBlob(sbot, path.join(__dirname, './agregore-demo-2.gif'))

  const fetch = makeSsbFetch({ sbot })
  const response = await fetch(convertLegacySSB(blobId))
  const contentType = response.headers.get('content-type')

  t.is(response.status, 200)
  t.is(contentType, 'image/gif')
  t.truthy(!sbot.db2migrate)
})

test.serial('fetch "about" message json', async t => {
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
  t.truthy(!sbot.db2migrate)
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
  t.truthy(!sbot.db2migrate)
})

test.serial('HEAD request of feed data returns Content-Length', async t => {
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
  const response = await fetch(feedUrl, { method: 'HEAD' })
  const contentType = response.headers.get('content-type')
  const contentLength = response.headers.get('content-length')

  t.is(response.status, 200)
  t.is(contentType, 'application/json; charset=utf-8')
  t.is(contentLength, '130')
  t.truthy(!sbot.db2migrate)
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
  t.truthy(!sbot.db2migrate)
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
  t.truthy(!sbot.db2migrate)
})
