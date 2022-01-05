const {
  decompose,
  isSSBURI,
  fromMessageSigil,
  fromBlobSigil,
  fromFeedSigil,
  toMessageSigil,
  toBlobSigil,
  toFeedSigil
} = require('ssb-uri2')
const {
  isMsgId,
  isBlobId,
  isFeedId,
  isMsgType,
  isBlobType,
  isFeedType,
  extract: extractSSBref
} = require('ssb-ref')
const debug = require('debug')('ssb-fetch')

module.exports = {
  looksLikeLegacySSB,
  convertLegacySSB,
  sigilToUrlSafe,
  parseUri
}

function sigilToUrlSafe(id) {
  const msgKey = isMsgId(id)
  const blobKey = isBlobId(id)
  const feedKey = isFeedId(id)
  // prettier-ignore
  const msgType = msgKey  ? 'msgKey'
                : blobKey ? 'blobKey' 
                : feedKey ? 'feedKey' 
                : null

  debug('sigilToUrlSafe msgType:', msgType, id)

  switch (msgType) {
    case 'msgKey':
      return fromMessageSigil(id)
    case 'blobKey':
      return fromBlobSigil(id)
    case 'feedKey':
      return fromFeedSigil(id)
    default:
      throw new Error(`Invalid ssb id: ${id}`)
  }
}

function parseUri(url) {
  try {
    if (!isSSBURI(url)) throw new Error(uriError(url))

    /** ssb:// errors with decompose but ssb: doesn't */
    if (url.startsWith('ssb://')) url = url.split('ssb://').join('ssb:')

    var decomposed = decompose(url)
    debug('decomposed', decomposed)

    switch (decomposed.type) {
      case 'message':
        return {
          ...decomposed,
          id: toMessageSigil(url)
        }

      case 'blob':
        return {
          ...decomposed,
          id: toBlobSigil(url)
        }

      case 'feed':
        return {
          ...decomposed,
          id: toFeedSigil(url)
        }
      default:
        throw new Error(uriError({ url, decomposed }))
    }
  } catch (error) {
    throw new Error(uriError({ url, decomposed, error }))
  }
}

function uriError(objs) {
  const spec = 'https://github.com/ssb-ngi-pointer/ssb-uri-spec'
  const error = `Invalid ssb link ${JSON.stringify(objs, null, 2)}`
  return `
${error}

See ${spec}
    `
}

function looksLikeLegacySSB(str) {
  if (!str.startsWith('%') && !str.startsWith('&') && !str.startsWith('@'))
    return false

  if (isMsgType(str)) return true
  if (isBlobType(str)) return true
  if (isFeedType(str)) return true
  return false
}

function convertLegacySSB(url) {
  return standardiseSSBuri(sigilToUrlSafe(extractSSBref(url)))
}

/** prefer ssb:// uri */
function standardiseSSBuri(url) {
  if (!url.startsWith('ssb://') && url.startsWith('ssb:')) {
    const path = url.split('ssb:')
    return `ssb://${path.slice(1)}`
  }

  return url
}
