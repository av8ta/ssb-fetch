const Headers = require('fetch-headers')
const makeFetch = require('make-fetch')
const {
  msgIdRegex,
  cloakedMsgIdRegex,
  feedIdRegex,
  blobIdRegex
} = require('ssb-ref')

let ssb

module.exports = function makeSsbFetch(options = {}) {
  ssb = require('./ssb')(options)

  const onClose = async () => undefined
  const fetch = makeFetch(ssbFetch)
  fetch.close = () => onClose()

  return fetch
}

async function ssbFetch({ url, headers: rawHeaders, method, signal, body }) {
  const responseHeaders = new Headers(rawHeaders || {})

  const isSsbURL = url.startsWith('ssb://')
  if (!isSsbURL) throw new Error('ssb url should be ssb://...')

  const msgId = url.split('ssb://')[1]
  const isSsbId = msgId.match(msgIdRegex)

  const shouldIntercept = isSsbURL && msgId && isSsbId
  if (!shouldIntercept) throw new Error('Invalid ssb uri')

  const sbot = await ssb

  if (method === 'GET') {
    responseHeaders['Content-Type'] = 'application/json; charset=utf-8'

    let statusCode = 200

    const data = await new Promise((resolve, reject) => {
      sbot.get({ id: msgId, private: true, meta: true }, (error, data) => {
        if (error) {
          if (error.name === 'NotFoundError') statusCode = 404
          else statusCode = 500
          reject(error)
        } else resolve(data)
      })
    })

    return {
      statusCode,
      headers: responseHeaders,
      data: intoAsyncIterable(JSON.stringify(data))
    }
  }
}

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
