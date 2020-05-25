const PORT = process.env.PORT || 9000

// log unhandled promise rejections
process.on('unhandledRejection', error => {
  console.error('unhandledRejection', error)
})

const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const RateLimit = require('express-rate-limit')
const EthQuery = require('ethjs-query')
const BN = require('bn.js')
const ethUtil = require('ethereumjs-util')
const geoIp = require('@pablopunk/geo-ip')
const emojiFlag = require('emoji-flag')
const config = require('./get-config')
const rpcWrapperEngine = require('./engine.js')

const appPath = path.join(__dirname, '..', 'build')

const min = 60 * 1000
const ether = 1e18
const faucetAmountWei = (1 * ether)
const EtherBN = new BN('1000000000000000000', 10)
const MAX_BALANCE = EtherBN.mul(new BN('4', 10))
const AUTO_RESTART_INTERVAL = 60 * min

console.log('Acting as faucet for address:', config.address)

//
// create engine
//

// ProviderEngine based caching layer, with fallback to geth
const engine = rpcWrapperEngine({
  rpcUrl: config.rpcOrigin,
  addressHex: config.address,
  privateKey: ethUtil.toBuffer(config.privateKey)
})

const ethQuery = new EthQuery(engine)

startServer()

//
// create webserver
//
function startServer () {
  const app = express()
  // set CORS headers
  app.use(cors())
  // parse body
  app.use(bodyParser.text({ type: '*/*' }))
  // trust the "x-forwarded-for" header from our reverse proxy
  app.enable('trust proxy')
  // serve app
  app.use(express.static(appPath))

  // add IP-based rate limiting
  if (!process.env.SKIP_RATE_LIMITER) {
    // configure rate limiter
    const rateLimiter = new RateLimit({
      // 15 minutes
      windowMs: 15 * min,
      // limit each IP to N requests per windowMs
      max: 20,
      // disable delaying - full speed until the max limit is reached
      delayMs: 200
    })
    app.post('/', rateLimiter)
  }
  // handle fauceting request
  app.post('/', handleRequest)

  // start server
  const server = app.listen(PORT, function () {
    console.log('ethereum rpc listening on', PORT)
    console.log('and proxying to', config.rpcOrigin)
  })

  setupGracefulShutdown(server)

  // Lazy nonce tracking fix:
  // Force an exit (docker will trigger a restart)
  setTimeout(() => {
    console.log('Restarting for better nonce tracking')
    shutdown()
  }, AUTO_RESTART_INTERVAL)

  async function handleRequest (req, res) {
    try {
      // parse ip-address
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress

      let flag
      try {
        const geoData = geoIp({ ip: ipAddress })
        const countryCode = geoData.country_code
        flag = emojiFlag(countryCode) + ' '
      } catch (err) {
        flag = '  '
      }

      // parse address
      let targetAddress = req.body
      if (!targetAddress || typeof targetAddress !== 'string') {
        return didError(res, new Error(`Address parse failure - request body empty`))
      }
      if (targetAddress.slice(0, 2) !== '0x') {
        targetAddress = '0x' + targetAddress
      }
      if (targetAddress.length !== 42) {
        return didError(res, new Error(`Address parse failure - "${targetAddress}"`))
      }

      const alignedIpAddress = ipAddress.padStart(15, ' ')
      const requestorMessage = `${flag} ${alignedIpAddress} requesting for ${targetAddress}`

      // check for greediness
      const balance = await ethQuery.getBalance(targetAddress, 'pending')
      const balanceTooFull = balance.gt(MAX_BALANCE)
      if (balanceTooFull) {
        console.log(`${requestorMessage} - already has too much ether`)
        return didError(res, new Error('User is greedy - already has too much ether'))
      }
      // send value
      const txHash = await ethQuery.sendTransaction({
        to: targetAddress,
        from: config.address,
        value: faucetAmountWei,
        data: ''
      })
      console.log(`${requestorMessage} - sent tx: ${txHash}`)
      res.send(txHash)
    } catch (err) {
      console.error(err.stack)
      return didError(res, err)
    }
  }

  function didError (res, err) {
    res.status(500).json({ error: err.message })
  }

  function setupGracefulShutdown () {
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  }

  // Do graceful shutdown
  function shutdown () {
    console.log('gracefully shutting down...')
    server.close(() => {
      console.log('shut down complete.')
      process.exit(0)
    })
  }
}
