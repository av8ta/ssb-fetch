const makeFetch = require('make-fetch')
const { parseUri, looksLikeLegacySSB, convertLegacySSB } = require('./uri')
const debugUri = require('debug')('ssb-fetch:uri')
const debugServing = require('debug')('ssb-fetch:serving')

let ssb, api

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
  api = options.api ? options.api : require('./api')(ssb)
  const onClose = async () => undefined
  const fetch = makeFetch(ssbFetch)
  fetch.close = () => onClose()
  return fetch
}

async function ssbFetch(resource) {
  const { url, headers: rawHeaders, method, signal, body, session, referrer } = resource
  debugServing('resource', resource)

  const isSsbURL = url.startsWith('ssb:')
  if (!isSsbURL) throw new Error('Invalid protocol, must be ssb:   https://github.com/ssb-ngi-pointer/ssb-uri-spec')

  const { type, format, id } = parseUrl(url)

  const methods = await api
  const { whoami, getMessage, getBlob, getFeed } = methods

  if (method === 'GET') {
    switch (type) {
      case 'message':
        return await getMessage({ id, private: true, meta: true })

      case 'blob':
        return await getBlob(id)

      case 'feed':
        return await getFeed(id)

      default:
        return {
          statusCode: 418,
          headers: { 'Content-Type': 'text/html' },
          data: intoAsyncIterable(
            '<html><body>ssb data type is not yet implemented. we do have tea though</body></html>'
          )
        }
    }
  }
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

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
