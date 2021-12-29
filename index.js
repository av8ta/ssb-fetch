const Headers = require('fetch-headers')
const makeFetch = require('make-fetch')
const {
  msgIdRegex,
  cloakedMsgIdRegex,
  feedIdRegex,
  blobIdRegex
} = require('ssb-ref')
const ssb = require('./ssb')

module.exports = function makeSsbFetch(options = {}) {
  // const { appname } = options

  const onClose = async () => undefined
  const fetch = makeFetch(ssbFetch)
  fetch.close = () => onClose()

  return fetch
}

function ssbFetch({ url, headers: rawHeaders, method, signal, body }) {
  return new Promise(resolve => {
    const responseHeaders = new Headers(rawHeaders || {})

    const isSsbURL = url.startsWith('ssb://')
    if (!isSsbURL) throw new Error('ssb url should be ssb://...')

    const msgId = url.split('ssb://')[1]
    const isSsbId = msgId.match(msgIdRegex)

    const shouldIntercept = isSsbURL && msgId && isSsbId
    if (!shouldIntercept) throw new Error('Invalid ssb uri')

    if (method === 'GET') {
      ssb.then(sbot => {
        responseHeaders['Content-Type'] = 'application/json; charset=utf-8'

        sbot.get({ id: msgId, private: true, meta: true }, (error, data) => {
          if (error) {
            if (error.name === 'NotFoundError')
              resolve({
                statusCode: 404,
                headers: responseHeaders,
                data: intoAsyncIterable(JSON.stringify(error))
              })
            else
              resolve({
                statusCode: 500,
                headers: responseHeaders,
                data: intoAsyncIterable(JSON.stringify(error))
              })
          } else {
            resolve({
              statusCode: 200,
              headers: responseHeaders,
              data: intoAsyncIterable(JSON.stringify(data))
            })
          }
        })
      })
    }
  })
}

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
