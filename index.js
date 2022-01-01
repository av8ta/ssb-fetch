const makeFetch = require('make-fetch')
const getBlob = require('./blobs')
const mime = require('mime-types')
const { parseUri, sigilToUrlSafe } = require('./uri')
const debug = require('debug')('ssb-fetch')
const bugReport = require('./bugs')
const FileType = require('file-type')
const Accept = require('@hapi/accept')

let ssb

module.exports = function makeSsbFetch(options = {}) {
  ssb = require('./ssb')(options)
  const onClose = async () => undefined
  const fetch = makeFetch(ssbFetch)
  fetch.close = () => onClose()
  return fetch
}

async function ssbFetch(resource) {
  const {
    url,
    headers: rawHeaders,
    method,
    signal,
    body,
    session,
    referrer
  } = resource
  debug('resource', resource)

  const responseHeaders = {}

  const isSsbURL = url.startsWith('ssb:')
  if (!isSsbURL)
    throw new Error(
      'Invalid protocol, must be ssb:   https://github.com/ssb-ngi-pointer/ssb-uri-spec'
    )

  const ssbSigil = url.startsWith('ssb:legacy:')
  if (ssbSigil) return convertLegacyResponse(url, rawHeaders)

  const { type, format, id } = parseUrl(url)

  const sbot = await ssb

  if (method === 'GET') {
    let statusCode = 200

    switch (type) {
      case 'message':
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

      case 'blob':
        try {
          const blob = await getBlob(sbot, id)
          const buffer = await collectBuffers(blob)
          const fileType = await FileType.fromBuffer(buffer)
          let mimetype = mime.lookup(fileType?.ext)

          if (!mimetype) {
            try {
              // prettier-ignore
              mimetype = JSON.parse(buffer.toString()) ? 'application/json; charset=utf-8' : undefined
            } catch (error) {}
          }

          if (!mimetype) mimetype = 'application/octet-stream'
          responseHeaders['Content-Type'] = mimetype
          responseHeaders['Connection'] = 'keep-alive'
          responseHeaders['Keep-Alive'] = 'timeout=5'
          responseHeaders['Transfer-Encoding'] = 'chunked'

          debug('mimetype', mimetype)
          debug('responseHeaders', responseHeaders)

          return {
            statusCode,
            headers: responseHeaders,
            data: intoAsyncIterable(buffer)
          }
        } catch (error) {
          let data
          statusCode = 500
          if (error.message === 'could not get blob') {
            statusCode = 404
            data = `NotFoundError:Key not found in database [${id}]`
          } else data = `Server error. Sorry about that! ${bugReport}`
          debug(error)
          return {
            statusCode,
            headers: { 'Content-Type': 'text/html' },
            data: intoAsyncIterable(data)
          }
        }

      default:
        return {
          statusCode: 418,
          headers: { 'Content-Type': 'text/html' },
          data: intoAsyncIterable(
            `<html><body>ssb data type is not yet implemented. we do have tea though</body></html>`
          )
        }
    }
  }
}

function parseUrl(url) {
  try {
    const parsed = parseUri(url)
    const { type, format, id } = parsed
    const shouldIntercept = type && format && id
    if (!shouldIntercept) throw new Error(`Invalid ssb url ${url}`)
    return parsed
  } catch (error) {
    debug('error parsing ssb uri', error)
    throw error
  }
}

/**
 * todo: make this service off by default in agregore ssb protocol config
 * that way it won't be abused! we want people using the correct
 * url in their code. it's very convenient to paste in an id from the database though
 *
 * in agregore:   ssb:legacy:<ssb msg id>
 * e.g.           ssb:legacy:&P7VkQqJZPkFFoEScB+37dBqOZXWLmy5dIrvICdEozcU=.sha256
 *
 * anchor tag returned to click on when text/html is in accept header
 * application/json in the accept header returns:
 *  {
 *    "id": "&P7VkQqJZPkFFoEScB+37dBqOZXWLmy5dIrvICdEozcU=.sha256",
 *    "url": "ssb:blob/sha256/P7VkQqJZPkFFoEScB-37dBqOZXWLmy5dIrvICdEozcU="
 *  }
 * */
function convertLegacyResponse(url, headers) {
  const id = url.split('ssb:legacy:')[1]
  const ssbUrl = sigilToUrlSafe(id)

  const capabilities = ['text/html', 'application/json']
  let mediaType = choosePrefferedMediaType(headers, capabilities)
  if (!mediaType) mediaType = 'application/octet-stream'
  debug('chosen mediaType', mediaType)

  if (mediaType === 'application/json')
    return {
      statusCode: 303,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      data: intoAsyncIterable(JSON.stringify({ id, url: ssbUrl }, null, 2))
    }

  if (mediaType === 'text/html') {
    const link = `<a href="${ssbUrl}">${ssbUrl}</a>`
    debug(`redirect link ${ssbUrl}`)

    return {
      statusCode: 303,
      headers: {
        'Content-Type': 'text/html'
        // 'Content-Type': 'application/json; charset=utf-8'
      },
      data: intoAsyncIterable(`<!DOCTYPE html>
      <html lang="en">
        <head></head>
          <body>${link}</body>
      </html>`)
    }
  }
}

function choosePrefferedMediaType(headers, capabilities = []) {
  // headers.accept = headers.accept += ', application/json'
  const accept = Accept.parseAll(headers).mediaTypes
  debug('Acceptable MediaTypes', accept)

  let mediaType = false
  accept.forEach(acceptableType => {
    capabilities.forEach(type => {
      if (!mediaType && type === acceptableType) mediaType = acceptableType
    })
  })
  return mediaType
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
