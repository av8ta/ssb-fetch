const { promisify } = require('util')
const bugReport = require('./bugs')
const { isString } = require('./utils')
const FileType = require('file-type')
const pullBlob = require('./blobs')
const mime = require('mime-types')
const debug = require('debug')('ssb-fetch')
const debugHeaders = require('debug')('ssb-fetch:headers')

const JSON_MIME = 'application/json; charset=utf-8'

module.exports = async ssb => {
  if (!ssb) Promise.reject(new Error('Must supply an ssb instance to ssb-fetch api'))

  const sbot = await ssb
  if (!sbot.get) throw new Error('Require ssb-db2/compat plugin when using ssb-db2')

  const isDb2 = !!sbot.db?.get

  const whoami = promisify(sbot.whoami)
  const getMsg = promisify(sbot.get)
  const aboutLatestValues = sbot.about ? promisify(sbot.about.latestValues) : null

  return new Promise((resolve, reject) => {
    async function getFeed(id) {
      if ((!aboutLatestValues || !sbot.backlinks) && !isDb2)
        return {
          statusCode: 404,
          headers: { 'Content-Type': JSON_MIME },
          data: intoAsyncIterable(
            JSON.stringify({
              error:
                'MissingPlugins: Profiles need ssb-about and ssb-backlinks plugins: https://github.com/ssbc/ssb-about https://github.com/ssbc/ssb-backlinks',
              plugins: ['ssb-about', 'ssb-backlinks']
            })
          )
        }

      const keys = ['name', 'image', 'description', 'location']

      try {
        let profile
        if (isDb2) {
          profile = await getDb2Profile(sbot, id)
        }
        if (!isDb2) {
          profile = await aboutLatestValues({ keys, dest: id })
        }
        /** be generous in what we accept and strict in what we send.
         *  most about messages for images are a string; image: '&an-image-blob-on-image-key.sha256'
         *  but many are an image object with a link property
         *  image: {
              link: '&an-image-blob-on-link-key.sha256',
              size: 100000,
              type: 'image/png',
              width: 600,
              height: 600
            }
            always return image.link
            todo: consider returning the missing size, type, width, height properties
            ... it may be an application concern though...
         */
        if (profile?.image && isString(profile.image)) profile.image = { link: profile.image }

        return {
          statusCode: 200,
          headers: { 'Content-Type': JSON_MIME },
          data: intoAsyncIterable(JSON.stringify({ ...profile, id }))
        }
      } catch (error) {
        const response = errorResponse(error, id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: intoAsyncIterable(response.uiError)
        }
      }
    }

    async function getMessage(options) {
      try {
        const data = await getMsg(options)

        return {
          statusCode: 200,
          headers: { 'Content-Type': JSON_MIME },
          data: intoAsyncIterable(JSON.stringify(data))
        }
      } catch (error) {
        const response = errorResponse(error, options.id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: intoAsyncIterable(response.uiError)
        }
      }
    }

    async function getBlob(id) {
      try {
        const blob = await pullBlob(sbot, id)
        const buffer = await collectBuffers(blob)
        const fileType = await FileType.fromBuffer(buffer)
        let mimetype = mime.lookup(fileType?.ext)

        if (!mimetype) {
          try {
            mimetype = JSON.parse(buffer.toString()) ? JSON_MIME : undefined
          } catch (error) {}
        }

        const headers = {}
        if (mimetype) headers['Content-Type'] = mimetype
        else headers['Content-Type'] = 'application/octet-stream'

        headers.Connection = 'keep-alive'
        headers['Keep-Alive'] = 'timeout=5'
        headers['Transfer-Encoding'] = 'chunked'

        debugHeaders('mimetype', mimetype)
        debugHeaders('headers', headers)

        return {
          statusCode: 200,
          headers,
          data: intoAsyncIterable(buffer)
        }
      } catch (error) {
        const response = errorResponse(error, id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: intoAsyncIterable(response.uiError)
        }
      }
    }

    resolve({
      whoami,
      getMessage,
      getBlob,
      getFeed
    })
  })
}

function getDb2Profile(sbot, id) {
  let done = false

  return new Promise((resolve, reject) => {
    sbot.db.onDrain('aboutSelf', () => {
      if (!done) {
        try {
          done = true
          const profile = sbot.db.getIndex('aboutSelf').getProfile(id)
          resolve(profile)
        } catch (error) {
          reject(error)
        }
      }
    })
  })
}

// todo: add sad-path tests to check for expected error messages
function errorResponse(error, id) {
  if (error.message?.includes('ssb-db.get: key *must*')) {
    return {
      ...error,
      uiError: `BadRequestError:Key key *must* be a ssb message id or a flume offset [${id}]`,
      statusCode: 400
    }
  }

  if (error.name === 'NotFoundError') {
    return {
      ...error,
      uiError: `NotFoundError:Key not found in database [${id}]`,
      statusCode: 404
    }
  }

  if (error.message?.includes('could not get blob')) {
    return {
      ...error,
      uiError: `NotFoundError:Key blob not found in database [${id}]`,
      statusCode: 404
    }
  }

  /** some unknown error. apologise profusely. */
  return {
    ...(isString(error) ? { message: error } : error),
    uiError: `Server error. Sorry about that! ${bugReport}`,
    statusCode: 500
  }
}

// from make-fetch
async function collectBuffers(iterable) {
  const all = []
  for await (const buff of iterable) {
    all.push(Buffer.from(buff))
  }
  return Buffer.concat(all)
}

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
