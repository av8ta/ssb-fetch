const pull = require('pull-stream')
const debug = require('debug')('ssb-fetch:blobs')
const { promisify } = require('util')

module.exports = async (sbot, id, range) => {
  const hasBlob = promisify(sbot.blobs.has)
  const getBlobSize = promisify(sbot.blobs.size)
  const requestBlob = promisify(sbot.blobs.want)

  const haveBlob = await hasBlob(id)
  if (haveBlob) {
    const size = await getBlobSize(id)
    // console.log('blob size is:', size, 'the range request is:', range)
    return pullBlob(sbot, id, range)
  }
  else {
    debug(`blob: ${id} not found locally. asking peers for it...`)
    const blobFound = await requestBlob(id)
    debug(`blob: ${id} ${blobFound ? '' : 'not'} found`)
    if (blobFound) return pullBlob(sbot, id, range)
    else return new Promise((_, reject) => reject('could not get blob'))
  }
}

async function pullBlob(sbot, id, range) {
  if (!range) return collectBuffers(await pullBlobComplete(sbot, id))
  else {
    return await pullBlobRanges(sbot, id, range)
  }
}

async function pullBlobRanges(sbot, id, range) {
  const buffers = []
  for await (const [start, end] of range) {
    const s = +start, e = +end
    // const s = +start, e = +end + 1
    // console.log('start,end:', s, e)
    buffers.push(await collectBuffers(await pullBlobRange(sbot, id, { start: s, end: e })))
  }
  return collectBuffers(buffers)
}

function pullBlobRange(sbot, id, { start, end }) {
  return new Promise((resolve, reject) => {
    pull(
      sbot.blobs.getSlice({ hash: id, start, end }),
      pull.collect((error, blob) => {
        if (error) {
          reject(error)
        }
        resolve(blob)
      })
    )
  })
}

function pullBlobComplete(sbot, id) {
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

// from make-fetch
async function collectBuffers(iterable) {
  const all = []
  for await (const buff of iterable) {
    all.push(Buffer.from(buff))
  }
  return Buffer.concat(all)
}
