const pull = require('pull-stream')
const debug = require('debug')('ssb-fetch:blobs')
const { promisify } = require('util')

module.exports = async (sbot, id) => {
  const hasBlob = promisify(sbot.blobs.has)
  const requestBlob = promisify(sbot.blobs.want)

  const haveBlob = await hasBlob(id)
  if (haveBlob) return pullBlob(sbot, id)
  else {
    debug(`blob: ${id} not found locally. asking peers for it...`)
    const blobFound = await requestBlob(id)
    debug(`blob: ${id} ${blobFound ? '' : 'not'} found`)
    if (blobFound) return pullBlob(sbot, id)
    else return new Promise((_, reject) => reject('could not get blob'))
  }
}

function pullBlob(sbot, id) {
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
