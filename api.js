const { promisify } = require('util')
const bugReport = require('./bugs')
const { isString } = require('./utils')
const FileType = require('file-type')
const pullBlob = require('./blobs')
const { parseRange } = require('./utils')
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

  return new Promise(resolve => {
    async function getFeedHeaders(id, { reqHeaders, method }) {
      const response = await getFeedResponse(id)
      response.headers = setResponseHeaders(id, response, method)
      if (method == 'HEAD') response.data = null // HEAD MUST not return a body
      return response
    }

    async function getFeed(id, { reqHeaders, method }) {
      const response = await getFeedResponse(id)
      response.headers = setResponseHeaders(id, response, method)
      if (response.data) response.data = intoAsyncIterable(response.data)
      return response
    }

    async function getFeedResponse(id) {
      if ((!aboutLatestValues || !sbot.backlinks) && !isDb2)
        return {
          statusCode: 404,
          headers: { 'Content-Type': JSON_MIME },
          data: JSON.stringify({
            error:
              'MissingPlugins: Profiles need ssb-about and ssb-backlinks plugins: https://github.com/ssbc/ssb-about https://github.com/ssbc/ssb-backlinks',
            plugins: ['ssb-about', 'ssb-backlinks']
          })
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
          data: JSON.stringify({ ...profile, id })
        }
      } catch (error) {
        const response = errorResponse(error, id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: response.uiError
        }
      }
    }

    async function getMessageHeaders(options, { reqHeaders, method }) {
      const response = await getMessageResponse(options)
      response.headers = setResponseHeaders(options.id, response, method)
      if (method == 'HEAD') response.data = null // HEAD MUST not return a body
      return response
    }

    async function getMessage(options, { reqHeaders, method }) {
      const response = await getMessageResponse(options)
      response.headers = setResponseHeaders(options.id, response, method)
      if (response.data) response.data = intoAsyncIterable(response.data)
      return response
    }

    async function getMessageResponse(options) {
      try {
        const data = await getMsg(options)

        return {
          statusCode: 200,
          headers: { 'Content-Type': JSON_MIME },
          data: JSON.stringify(data)
        }
      } catch (error) {
        const response = errorResponse(error, options.id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: response.uiError
        }
      }
    }

    async function getBlobHeaders(id, { reqHeaders, method }) {
      const range = reqHeaders.range ? parseRange(reqHeaders.range) : undefined
      const response = await getBlobResponse(id, range)
      response.headers = setResponseHeaders(id, response, method, range)
      if (method == 'HEAD') response.data = null // HEAD MUST not return a body
      return response
    }

    async function getBlob(id, { reqHeaders, method }) {
      const range = reqHeaders.range ? parseRange(reqHeaders.range) : undefined
      const response = await getBlobResponse(id, range)
      response.headers = setResponseHeaders(id, response, method, range)
      if (response.data) response.data = intoAsyncIterable(response.data)
      return response
    }

    async function getBlobResponse(id, range) {
      try {
        const buffer = await pullBlob(sbot, id, range)
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

        debugHeaders('mimetype', mimetype)
        debugHeaders('headers', headers)

        return {
          statusCode: range ? 206 : 200,
          headers,
          data: buffer
        }
      } catch (error) {
        const response = errorResponse(error, id)
        debug(response)
        return {
          statusCode: response.statusCode,
          data: response.uiError
        }
      }
    }

    resolve({
      whoami,
      getMessage,
      getMessageHeaders,
      getBlob,
      getBlobHeaders,
      getFeed,
      getFeedHeaders
    })
  })
}

/**
    A sender MUST NOT send a Content-Length header field in any message that contains a 
    Transfer-Encoding header field.

    A user agent SHOULD send a Content-Length in a request message when no 
    Transfer-Encoding is sent and the request method defines a meaning for an enclosed payload body.
    
    For example, a Content-Length header field is normally sent in a 
    POST request even when the value is 0 (indicating an empty payload body). 

    A user agent SHOULD NOT send a Content-Length header field when the 
    request message does not contain a payload body and the method semantics do not anticipate such a body.

    A server MAY send a Content-Length header field in a response to a 
    HEAD request (Section 4.3.2 of [RFC7231]); a server MUST NOT send 
    Content-Length in such a response unless its field-value equals the 
    decimal number of octets that would have been sent in the payload body of a 
    response if the same request had used the GET method.

    A server MAY send a Content-Length header field in a 304 (Not Modified) 
    response to a conditional GET request (Section 4.1 of [RFC7232]); 
    a server MUST NOT send Content-Length in such a response 
    unless its field-value equals the decimal number of octets that would have been 
    sent in the payload body of a 200 (OK) response to the same request.

    A server MUST NOT send a Content-Length header field in any response with a 
    status code of 1xx (Informational) or 204 (No Content). 
    
    A server MUST NOT send a Content-Length header field in any 2xx (Successful) 
    response to a CONNECT request (Section 4.3.6 of [RFC7231]).

    Aside from the cases defined above, in the absence of Transfer-Encoding, 
    an origin server SHOULD send a Content-Length header field when the payload body size is known 
    prior to sending the complete header section. This will allow downstream recipients to measure 
    transfer progress, know when a received message is complete, 
    and potentially reuse the connection for additional requests.

    Any Content-Length field value greater than or equal to zero is valid. 
    Since there is no predefined limit to the length of a payload, 
    a recipient MUST anticipate potentially large decimal numerals and 
    prevent parsing errors due to integer conversion overflows (Section 9.3).

    If a message is received that has multiple Content-Length header fields with 
    field-values consisting of the same decimal value, 
    or a single Content-Length header field with a field value containing a 
    list of identical decimal values (e.g., "Content-Length: 42, 42"), 
    indicating that duplicate Content-Length header fields have been 
    generated or combined by an upstream message processor, 
    then the recipient MUST either reject the message as invalid or 
    replace the duplicated field-values with a single valid 
    Content-Length field containing that decimal value prior to determining the 
    message body length or forwarding the message.

    Note: HTTP's use of Content-Length for message framing differs significantly from the same field's use in MIME, where it is an optional field used only within the "message/external-body" media-type.

    3.3.3. Message Body Length
*/

/**
  * https://httpwg.org/specs/rfc7233.html#status.206
  * If a single part is being transferred, the server generating the 206 response MUST generate a 
  * Content-Range header field, describing what range of the selected representation is enclosed, 
  * and a payload consisting of the range. For example:

          HTTP/1.1 206 Partial Content
          Date: Wed, 15 Nov 1995 06:25:24 GMT
          Last-Modified: Wed, 15 Nov 1995 04:58:08 GMT
          Content-Range: bytes 21010-47021/47022
          Content-Length: 26012
          Content-Type: image/gif
 */

/** ssb blob is immutable */
// blobResponse.headers['ETag'] = id

/** https://httpwg.org/specs/rfc7231.html#payload */
/** https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.13 content-length */
/** https://httpwg.org/specs/rfc7231.html#GET */

/** https://httpwg.org/specs/rfc7231.html#HEAD */

function printHeaders(response) {
  for (let [key, value] of response.headers.entries()) {
    console.log(key + ': ' + value)
  }
}

function setResponseHeaders(id, response, method, range) {
  const headers = { ...response.headers }
  headers['Access-Control-Allow-Origin'] = '*'
  headers['Allow-CSP-From'] = '*'
  headers['Access-Control-Allow-Headers'] = '*'
  headers['Access-Control-Allow-Methods'] = 'GET, HEAD'
  headers.Connection = 'keep-alive'
  headers['Keep-Alive'] = 'timeout=10'
  headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Encoding, Content-Length'

  headers['ETag'] = id
  if (response?.data?.length) headers['Content-Length'] = response.data.length

  return headers
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

async function* intoAsyncIterable(data) {
  yield Buffer.from(data)
}
