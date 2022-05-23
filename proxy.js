const http = require('http')
const { makeSsbFetch } = require('./index')
const debug = require('debug')('ssb-rest:proxy')

const fetch = makeSsbFetch()

http
  .createServer((request, response) => {
    const { headers, method, url } = request
    debug('headers', headers, 'method', method, 'url', url)
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
        fetch(url.slice(1), { headers })
          .then(r => {
            const contentType = r.headers.get('content-type')
            const statusCode = headers.range ? 206 : 200

            response.writeHead(statusCode, {
              'Content-Type': contentType,
              'X-Powered-By': 'ssb-fetch'
            })

            console.info('request headers:', headers, '\n')
            if (headers.range) console.info('request range:', headers.range, '\n')
            console.info(`response headers:\n${response._header}`)

            if (contentType?.includes('json')) return r.json()
            if (contentType?.includes('text')) return r.text()
            if (contentType?.includes('application/')) return r.text()
            else {
              response.writeHead(404, {
                'Content-Type': contentType,
                'X-Powered-By': 'ssb-fetch'
              })
              return {
                error: 'content type is not impemented in proxy',
                contentType
              }
            }
          })
          .then(res => response.end(JSON.stringify(res)))
      })
  })
  .listen(8080)
