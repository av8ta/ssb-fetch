const Client = require('ssb-client')

module.exports = new Promise((resolve, reject) => {
  Client((error, sbot) => {
    if (error) reject(error)
    else resolve(sbot)
  })
})
