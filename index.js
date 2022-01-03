const makeFetch = require('make-fetch')
const getBlob = require('./blobs')
const mime = require('mime-types')
const { parseUri, looksLikeLegacySSB, convertLegacySSB } = require('./uri')
const debug = require('debug')('ssb-fetch')
const bugReport = require('./bugs')
const FileType = require('file-type')
const Accept = require('@hapi/accept')

let ssb

module.exports = {
  makeSsbFetch,
  convertLegacySSB,
  looksLikeLegacySSB
}

function makeSsbFetch(options = {}) {
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
  let parsed
  try {
    parsed = parseUri(url)
    debug('parseUrl', parsed)
    const { type, format, id } = parsed
    const shouldIntercept = type && format && id
    if (!shouldIntercept) throw new Error(`Invalid ssb url ${url}`)
    return parsed
  } catch (error) {
    debug('error parsing ssb uri', url, parsed, error)
    throw error
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
