const file = require('pull-file')
const pull = require('pull-stream')

module.exports = {
  Server,
  publish,
  addBlob
}

function Server(options = {}) {
  return new Promise(resolve => {
    const stack = require('scuttle-testbot')
    if (options.db2) stack.use(require('ssb-db2/compat'))
    if (options.about) stack.use(require('ssb-about'))
    if (options.backlinks) stack.use(require('ssb-backlinks'))
    if (options.aboutSelf) stack.use(require('ssb-db2/about-self'))
    stack.use(require('ssb-blobs'))
    resolve(stack(options))
  })
}

function publish(sbot, content) {
  // const write = sbot.db?.publish ? sbot.db.publish : sbot.publish
  return new Promise((resolve, reject) => {
    sbot.publish(content, (error, msg) => {
      if (error) reject(error)
      else resolve(msg.key)
    })
  })
}

function addBlob(sbot, filePath) {
  return new Promise((resolve, reject) => {
    pull(
      file(filePath),
      sbot.blobs.add((error, blobId) => {
        if (error) reject(error)
        else resolve(blobId)
      })
    )
  })
}
