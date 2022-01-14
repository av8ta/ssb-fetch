const makeFetch = require('make-fetch')
const getBlob = require('./blobs')
const mime = require('mime-types')
const { parseUri, looksLikeLegacySSB, convertLegacySSB } = require('./uri')
const debugUri = require('debug')('ssb-fetch:uri')
const debugHeaders = require('debug')('ssb-fetch:headers')
const debugServing = require('debug')('ssb-fetch:serving')
const bugReport = require('./bugs')
const FileType = require('file-type')
const Accept = require('@hapi/accept')
const Headers = require('fetch-headers')

let ssb

module.exports = {
  makeSsbFetch,
  convertLegacySSB,
  looksLikeLegacySSB
}

/**
 * options are either as per ssb-config: https://github.com/ssbc/ssb-config#configuration
 *
 * or you can pass an sbot instance:
 * {
 *    sbot: your-sbot-instance
 * }
 */
function makeSsbFetch(options = {}) {
  ssb = options.sbot ? options.sbot : require('./ssb')(options)
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
  debugServing('resource', resource)

  const h = new Headers(rawHeaders || {})
  debugHeaders('new Headers(rawHeaders || {})=========>', h, '<==========')
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
        let data = await new Promise(resolve => {
          sbot.get({ id, private: true, meta: true }, (error, data) => {
            if (error) {
              debugServing('error', error)
              statusCode = 500
              if (error.name === 'NotFoundError') statusCode = 404
              resolve(`NotFoundError:Key not found in database [${id}]`)
            } else resolve(data)
          })
        })

        if (isString(data) && data.startsWith('NotFoundError'))
          return {
            statusCode,
            headers: responseHeaders,
            data: intoAsyncIterable(data)
          }

        // rawHeaders.accept = rawHeaders.accept += ', text/json'
        // rawHeaders.accept = rawHeaders.accept += ', text/markdown'
        // rawHeaders.accept = rawHeaders.accept += ', application/json'
        // rawHeaders.accept = rawHeaders.accept += ', application/json, text/markdown'
        debugHeaders('rawHeaders', rawHeaders)
        const mediaType = choosePrefferedMediaType(rawHeaders, [
          'application/json',
          'text/json',
          'text/markdown'
          // 'text/html'
        ])

        debugHeaders('choosePrefferedMediaType:', mediaType)
        debugHeaders('wantsMarkdown', wantsMarkdown(mediaType))
        debugHeaders('wantsText', wantsText(mediaType))
        debugHeaders('wantsJson', wantsJson(mediaType))
        debugHeaders('isPost', isPost(data))
        // prettier-ignore
        debugHeaders('wantsMarkdown && isPost', wantsMarkdown(mediaType) && isPost(data))

        if (wantsMarkdown(mediaType) && isPost(data)) {
          // responseHeaders['Content-Type'] = 'text/markdown+ssb'
          responseHeaders['Content-Type'] = 'text/markdown'
          data = data.value.content.text
        } else if (wantsText(mediaType))
          responseHeaders['Content-Type'] = 'text/json'
        else responseHeaders['Content-Type'] = 'application/json; charset=utf-8'

        data = JSON.stringify(data)
        // }

        debugHeaders('responseHeaders', responseHeaders)
        debugServing('response', data)

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

          debugHeaders('mimetype', mimetype)
          debugHeaders('responseHeaders', responseHeaders)

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
          debugServing(error)
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

function wantsMarkdown(mediaType) {
  return (
    mediaType && (mediaType.includes('markdown') || mediaType.includes('html'))
  )
}
function wantsJson(mediaType) {
  return mediaType && mediaType.includes('json')
}
function wantsText(mediaType) {
  return mediaType && mediaType.includes('text/json')
}

function isPost(message) {
  return !!(
    message.value?.content?.type === 'post' && message.value?.content?.text
  )
}

function isString(s) {
  return !!(typeof s === 'string' || s instanceof String)
}

function parseUrl(url) {
  let parsed
  try {
    parsed = parseUri(url)
    debugUri('parseUrl', parsed)
    const { type, format, id } = parsed
    const shouldIntercept = type && format && id
    if (!shouldIntercept) throw new Error(`Invalid ssb url ${url}`)
    return parsed
  } catch (error) {
    debugUri('error parsing ssb uri', url, parsed, error)
    throw error
  }
}

function choosePrefferedMediaType(headers, capabilities = []) {
  debugHeaders('choose......', headers)
  // headers = 'text/json' + headers
  const accept = Accept.parseAll(headers).mediaTypes
  debugHeaders('Acceptable MediaTypes', accept)

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
