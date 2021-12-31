const URL = require('url')
const pull = require('pull-stream')
const identify = require('pull-identify-filetype')

module.exports = (sbot, url) => {
  const parsed = URL.parse(url, true)
  const hash = decodeURIComponent(parsed.pathname.slice(1))
  let fileType

  return new Promise((resolve, reject) => {
    pull(
      sbot.blobs.get(hash),
      identify(type => {
        if (type) fileType = type
      }),
      pull.collect((error, blob) => {
        if (error) reject(error)
        resolve({
          fileType,
          blob
        })
      })
    )
  })
}
