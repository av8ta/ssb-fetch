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
const { isMsgId, isBlobId, isFeedId } = require('ssb-ref')
const debug = require('debug')('ssb-fetch')

module.exports = {
  sigilToUrlSafe: id => {
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
  },
  parseUri: url => {
    if (!isSSBURI(url)) throw new Error(`url is not a valid ssb uri: ${url}`)

    try {
      const decomposed = decompose(url)
      debug('decomposed', decomposed)

      switch (decomposed.type) {
        case 'message':
          const message = {
            ...decomposed,
            id: toMessageSigil(url)
          }
          console.log('parsed ', message)
          if (!isMsgId(message.id)) {
            const error = uriError(message)
            throw new Error(error)
          }
          debug('parsed uri:', message)
          return message

        case 'blob':
          const blob = {
            ...decomposed,
            id: toBlobSigil(url)
          }
          debug('parsed uri:', blob)
          if (!isBlobId(blob.id)) {
            const error = uriError(blob)
            throw new Error(error)
          }
          return blob

        case 'feed':
          const feed = {
            ...decomposed,
            id: toFeedSigil(url)
          }
          debug('parsed uri:', feed)
          if (!isFeedId(feed.id)) {
            const error = uriError(feed)
            throw new Error(error)
          }
          return feed

        default:
          return decomposed
      }
    } catch (error) {
      debug('Error parsing url', error)
    }
  }
}

function uriError(parsed) {
  const spec = 'https://github.com/ssb-ngi-pointer/ssb-uri-spec'
  const error = `Invalid ssb link ${JSON.stringify(parsed, null, 2)}`
  return `
${error}

See ${spec}
    `
}
