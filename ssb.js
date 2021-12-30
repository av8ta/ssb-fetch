const Client = require('ssb-client')

module.exports = options =>
  new Promise((resolve, reject) => {
    Client(options, (error, sbot) => {
      if (error) reject(error)
      else resolve(sbot)
    })
  })

// module.exports = new Promise((resolve, reject) => {
//   Client((error, sbot) => {
//     if (error) reject(error)
//     else resolve(sbot)
//   })
// })
