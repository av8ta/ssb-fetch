const pull = require('pull-stream')

module.exports = (sbot, id) => {
  return new Promise((resolve, reject) => {
    pull(
      sbot.blobs.get(id),
      pull.collect((error, blob) => {
        if (error) {
          reject(error)
        }
        resolve(blob)
      })
    )
  })
}
