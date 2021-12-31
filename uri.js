const { isSSBURI, toMessageSigil, decompose } = require('ssb-uri2')
const { isMsgId, isBlobId } = require('ssb-ref')

module.exports = {
  parse: function (url) {
    // if (!isSSBURI(url)) throw new Error(`url is not a valid ssb uri: ${url}`) // throwing on valid uri

    const decomposed = decompose(url)

    switch (decomposed.type) {
      case 'message':
        const message = {
          ...decomposed,
          id: toMessageSigil(url)
        }
        if (!isMsgId(message.id))
          throw new Error(
            `message uri did not parse correctly, id: ${message.id}`
          )
        return message
      case 'blob':
        const blob = {
          ...decomposed,
          id: urlToBlobId(url)
          // id: toBlobSigil(url) // returning null
          // id: `&${decomposed.data}.${decomposed.format}` // data is not complete - appears to be split at a slash near the end so is missing characters after that slash
        }
        if (!isBlobId(blob.id))
          throw new Error(`blob uri did not parse correctly, id: ${blob.id}`)
        return blob
      default:
        return decomposed
    }
  }
}

// todo: decompose is stripping off some data from the hash id
// appears to be slicing at a later slash
// likely a bug in ssb-uri2
function urlToBlobId(url) {
  const { format } = decompose(url)
  const data = url.split(`/${format}/`)[1]
  return `&${data}.${format}`
}
