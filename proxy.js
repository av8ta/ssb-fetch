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
        fetch(url.slice(1))
          .then(r => {
            const contentType = r.headers.get('content-type')

            response.writeHead(200, {
              'Content-Type': contentType,
              'X-Powered-By': 'ssb-fetch'
            })

            if (contentType?.includes('json')) return r.json()
            if (contentType?.includes('text')) return r.text()
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
