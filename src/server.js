const MASCARA_SUPPORT = process.env.MASCARA_SUPPORT
const PORT = process.env.PORT || 9000

const fs = require('fs')
const express = require('express')
const Browserify = require('browserify')
const envify = require('envify/custom')
const bodyParser = require('body-parser')
const cors = require('cors')
const RateLimit = require('express-rate-limit')
const EthQuery = require('ethjs-query')
const BN = require('bn.js')
const ethUtil = require('ethereumjs-util')
const geoIp = require('@pablopunk/geo-ip')
const emojiFlag = require('emoji-flag')

const config = require('./get-config')
const rpcWrapperEngine = require('./index.js')
const regularPageCode = fs.readFileSync(__dirname + '/index.html', 'utf-8')
const mascaraPageCode = fs.readFileSync(__dirname + '/zero.html', 'utf-8')
const pageCode = MASCARA_SUPPORT ? mascaraPageCode : regularPageCode

const min = 60 * 1000
const ether = 1e18
const faucetAmountWei = (1 * ether)
const EtherBN = new BN('1000000000000000000', 10)
const MAX_BALANCE = EtherBN.mul(new BN('10', 10))

console.log('Acting as faucet for address:', config.address)

//
// create engine
//

// ProviderEngine based caching layer, with fallback to geth
const engine = rpcWrapperEngine({
  rpcUrl: config.rpcOrigin,
  addressHex: config.address,
  privateKey: ethUtil.toBuffer(config.privateKey),
})

const ethQuery = new EthQuery(engine)

// prepare app bundle
const browserify = Browserify()
// inject faucet address
browserify.transform(envify({
  FAUCET_ADDRESS: config.address,
}))
// build app
browserify.add(__dirname + '/app.js')
browserify.bundle(function(err, bundle){
  if (err) throw err
  const appCode = bundle.toString()
  startServer(appCode)
})

//
// create webserver
//
function startServer(appCode) {

  const app = express()
  // set CORS headers
  app.use(cors())
  // parse body
  app.use(bodyParser.text({ type: '*/*' }))
  // trust the "x-forwarded-for" header from our reverse proxy
  app.enable('trust proxy')

  // configure rate limiter
  const rateLimiter = new RateLimit({
    // 15 minutes
    windowMs: 15 * min,
    // limit each IP to N requests per windowMs
    max: 20,
    // disable delaying - full speed until the max limit is reached
    delayMs: 0,
  })

  // serve app
  app.get('/', deliverPage)
  app.get('/index.html', deliverPage)
  app.get('/app.js', deliverApp)

  // add IP-based rate limiting
  app.post('/', rateLimiter)
  // handle fauceting request
  app.post('/', handleRequest)

  // start server
  const server = app.listen(PORT, function(){
    console.log('ethereum rpc listening on', PORT)
    console.log('and proxying to', config.rpcOrigin)
  })

  setupGracefulShutdown(server)

  // Lazy nonce tracking fix:
  // Force an exit after ten minutes (docker will trigger a restart)
  setTimeout(() => {
    console.log('Restarting for better nonce tracking')
    shutdown()
  }, 10 * min)

  return


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
      const targetAddress = req.body
      if (targetAddress.slice(0,2) !== '0x') {
        targetAddress = '0x'+targetAddress
      }
      if (targetAddress.length !== 42) {
        return didError(res, new Error(`Address parse failure - "${targetAddress}"`))
      }

      const requestorMessage = `${flag} ${ipAddress} requesting for ${targetAddress}`

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
        data: '',
      })
      console.log(`${requestorMessage} - sent tx: ${txHash}`)
      res.send(txHash)

    } catch (err) {
      console.error(err.stack)
      return didError(res, err)
    }
  }

  function didError(res, err){
    res.status(500).json({ error: err.message })
  }

  function invalidRequest(res){
    res.status(400).json({ error: 'Not a valid request.' })
  }

  function deliverPage(req, res){
    res.status(200).send(pageCode)
  }

  function deliverApp(req, res){
    res.status(200).send(appCode)
  }

  function setupGracefulShutdown() {
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)  
  }

  // Do graceful shutdown
  function shutdown() {
    console.log('gracefully shutting down...')
    server.close(() => {
      console.log('shut down complete.')
      process.exit(0)
    })
  }

}

