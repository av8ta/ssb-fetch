const http = require('http')
const { makeSsbFetch } = require('./index')
const debug = require('debug')('ssb-rest:proxy')

const fetch = makeSsbFetch()

http
  .createServer((request, response) => {
    const { headers, method, url } = request
    // console.log('request to proxy:', request)
    debug('headers:', headers, ', method:', method, ', url:', url)
    console.log('request headers', headers, 'method', method, 'url', url)
    let body = []
    request
      .on('error', err => {
        console.error(err)
      })
      .on('data', chunk => {
        body.push(chunk)
      })
      .on('end', () => {
        body = Buffer.concat(body).toString()

        if (body) debug('body', body)

        // strip leading / off
        fetch(url.slice(1), { headers, method })
          .then(fetchResponse => {
            const contentType = fetchResponse.headers.get('content-type')

            fetchResponse.headers.set('X-Powered-By', 'ssb-fetch-proxy')
            const responseHeaders = {}
            for (let [key, value] of fetchResponse.headers.entries()) {
              responseHeaders[key] = value
              console.log(`fetchResponse: ${key}: ${value}`)
            }

            response.writeHead(fetchResponse.status, responseHeaders)

            console.info('request headers:', headers, '\n')
            if (headers.range) console.info('request range:', headers.range, '\n')
            console.info(`response._header:\n${response._header}`)

            if (contentType?.includes('json')) return fetchResponse.json()
            else return fetchResponse.text()
          })
          .then(res => response.end(res))
      })
  })
  .listen(4080)
