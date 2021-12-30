const Client = require('ssb-client')
const Config = require('ssb-config/inject')
const debug = require('debug')('ssb-fetch')

module.exports = (options = {}) =>
  new Promise((resolve, reject) => {
    const appname = options.appname || process.env.ssb_appname || 'ssb'
    options.appname = appname
    process.env.ssb_appname = appname
    const config = Config(appname, options)
    const keys = config.keys
    keys.private = null
    debug({ ...config, keys })

    Client(config, (error, sbot) => {
      if (error) reject(error)
      else resolve(sbot)
    })
  })
