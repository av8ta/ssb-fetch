const Headers = require('fetch-headers')
const makeFetch = require('make-fetch')
const getBlob = require('./blobs')
const mime = require('mime-types')
const { parse } = require('./uri')
const debug = require('debug')('ssb-fetch')

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
  let parsed
  try {
    parsed = parse(url)
  } catch (error) {
    debug('error parsing ssb uri', error)
    throw error
  }

  const { type, format, id } = parsed
  const shouldIntercept = type && format && id
  if (!shouldIntercept) throw new Error('Invalid ssb uri')

  const isMessage = type === 'message'
  const isABlob = type === 'blob'

  const sbot = await ssb

  if (method === 'GET') {
    let statusCode = 200

    if (isMessage) {
      const data = await new Promise(resolve => {
        responseHeaders['Content-Type'] = 'application/json; charset=utf-8'
        sbot.get({ id, private: true, meta: true }, (error, data) => {
          if (error) {
            debug('error', error)
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
        const { blob, fileType } = await getBlob(sbot, id)
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
