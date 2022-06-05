const makeFetch = require('make-fetch')
const { parseUri, looksLikeLegacySSB, convertLegacySSB } = require('./uri')
const debugUri = require('debug')('ssb-fetch:uri')
const debugServing = require('debug')('ssb-fetch:serving')

let ssb, api

module.exports = {
  parseUri,
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
  const { url, headers: reqHeaders, method, signal, body, session, referrer } = resource
  debugServing('resource', resource)

  const isSsbURL = url.startsWith('ssb:')
  if (!isSsbURL) throw new Error('Invalid protocol, must be ssb:   https://github.com/ssb-ngi-pointer/ssb-uri-spec')

  const { type, format, id } = parseUrl(url)

  const apiMethods = await api
  const { getMessage, getMessageHeaders, getBlob, getBlobHeaders, getFeed, getFeedHeaders } = apiMethods

  if (method === 'GET') {
    switch (type) {
      case 'message':
        return await getMessage({ id, private: true, meta: true }, { reqHeaders, method })

      case 'blob':
        return await getBlob(id, { reqHeaders, method })

      case 'feed':
        return await getFeed(id, { reqHeaders, method })

      default:
        return {
          statusCode: 418,
          headers: { 'Content-Type': 'text/html' },
          data: intoAsyncIterable(
            '<html><body>ssb data type is not yet implemented. we do have tea though</body></html>'
          )
        }
    }
  } else if (method === 'HEAD') {
    switch (type) {
      case 'message':
        return await getMessageHeaders({ id, private: true, meta: true }, { reqHeaders, method })

      case 'blob':
        return await getBlobHeaders(id, { reqHeaders, method })

      case 'feed':
        return await getFeedHeaders(id, { reqHeaders, method })

      default:
        return {
          statusCode: 418,
          headers: {
            'Access-Control-Allow-Methods': 'GET, HEAD',
            'Content-Type': 'text/html'
          }
        }
    }
  } else return notImplemented(method)
}

function notImplemented(method) {
  return {
    statusCode: 405,
    headers: {
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Content-Type': 'text/html'
    },
    data: intoAsyncIterable(`<html><body>${method} not implemented</body></html>`)
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
