const Headers = require('fetch-headers')
const makeFetch = require('make-fetch')
const { isBlobId, isMsgId } = require('ssb-ref')
const getBlob = require('./blobs')
const mime = require('mime-types')

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

  const id = url.split('ssb://')[1]
  const isMessage = isMsgId(id)
  const isABlob = isBlobId(id)

  const shouldIntercept = isSsbURL && (isMessage || isABlob)
  if (!shouldIntercept) throw new Error('Invalid ssb uri')

  const sbot = await ssb

  if (method === 'GET') {
    let statusCode = 200

    if (isMessage) {
      const data = await new Promise((resolve, reject) => {
        responseHeaders['Content-Type'] = 'application/json; charset=utf-8'

        sbot.get({ id, private: true, meta: true }, (error, data) => {
          if (error) {
            console.error('error', error)
            statusCode = 500
            if (error.name === 'NotFoundError') statusCode = 404
            resolve(`NotFoundError:Key not found in database [${id}]`)
          } else resolve(JSON.stringify(data))
        })
      })

      return {
        statusCode,
        headers: responseHeaders,
        data: intoAsyncIterable(data)
      }
    }

    if (isABlob) {
      try {
        const { blob, fileType } = await getBlob(sbot, url)
        const buffer = await collectBuffers(blob)
        const mimetype = fileType ? mime.lookup(fileType) : undefined

        // responseHeaders['Content-Security-Policy'] = "default-src 'self';"
        // responseHeaders['Content-Type'] = mimetype
        // responseHeaders['Accept-Ranges'] = 'bytes'
        // responseHeaders['Content-Length'] = `${buffer.length}`

        responseHeaders['Content-Type'] = 'text/html'

        const html = makeTemplate(mimetype, buffer)

        return {
          statusCode,
          headers: responseHeaders,
          data: intoAsyncIterable(html)
        }
      } catch (error) {
        if (error.message === 'could not get blob') statusCode = 404
        return {
          statusCode,
          headers: responseHeaders,
          data: intoAsyncIterable(
            `NotFoundError:Key not found in database [${id}]`
          )
        }
      }
    }
  }
}

function makeTemplate(mimetype, buffer) {
  mimetype = mimetype || 'audio/mpeg' // hack so at least audio and images work for now todo: look at ssb message to determine mimetype
  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ssb blob</title>
  </head>
  <body>
    <iframe style="position: absolute; height: 100%; border: none;" width="100%" src="${dataUri}"></iframe>
  </body>
  </html>`
}

// from make-fetch
async function collectBuffers(iterable) {
  const all = []
  for await (const buff of iterable) {
    all.push(Buffer.from(buff))
  }
  return Buffer.concat(all)
}

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
