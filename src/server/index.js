const PORT = process.env.PORT || 9000

// log unhandled errors
process.on('unhandledRejection', error => {
  console.error('unhandledRejection', error)
})
process.on('uncaughtException', (err) => {
  console.error(`uncaughtException: ${err.stack || err.message || err}`)
})

const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const EthQuery = require('ethjs-query')
const BN = require('bn.js')
const ethUtil = require('ethereumjs-util')
const geoIp = require('@pablopunk/geo-ip')
const emojiFlag = require('emoji-flag')
const config = require('./get-config')
const rpcWrapperEngine = require('./engine.js')

const appPath = path.join(__dirname, '../../', 'build')

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
// 
// need to be able to dynamically change rpcOrigin based on network requesting funds
const engine = rpcWrapperEngine({
  rpcUrl: config.rpcOrigin,
  addressHex: config.address,
  privateKey: ethUtil.toBuffer(config.privateKey)
})

engine.on('error', (err) => {
  console.error(`Error in ProviderEngine: ${err.stack || err.message || err}`)
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

  // handle fauceting request
  app.post('/v0/request', handleRequest)

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
      // parse address
      // can parse for network here.
      // can either be json object or
      // inserted in a combined rawdata string with address, and then parsed out here
      // depending on what the network is, make sure ethQuery engine knows when 
      // testing balance and sending transaction
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
      // parse ip-address
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress
      // get flag for ip-address
      let flag
      try {
        const geoData = geoIp({ ip: ipAddress })
        const countryCode = geoData.country_code
        flag = emojiFlag(countryCode) + ' '
      } catch (err) {
        flag = '  '
      }
      // create label string for log
      const alignedIpAddress = ipAddress.padStart(15, ' ')
      const requestorMessage = `${flag} ${alignedIpAddress} requesting for ${targetAddress}`
      // check for greediness
      //
      // need to change network here:
      const balance = await ethQuery.getBalance(targetAddress, 'pending')
      const balanceTooFull = balance.gt(MAX_BALANCE)
      if (balanceTooFull) {
        console.log(`${requestorMessage} - already has too much ether`)
        return didError(res, new Error('User is greedy - already has too much ether'))
      }
      // send value
      // need ot change network here as well:
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
