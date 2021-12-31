const pull = require('pull-stream')
const identify = require('pull-identify-filetype')

module.exports = (sbot, id) => {
  let fileType

  return new Promise((resolve, reject) => {
    pull(
      sbot.blobs.get(id),
      identify(type => {
        if (type) fileType = type
        // todo: video & audio mimetypes are undefined
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
