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
const config = require('./get-config')
const rpcWrapperEngine = require('./index.js')
const regularPageCode = fs.readFileSync(__dirname + '/index.html', 'utf-8')
const mascaraPageCode = fs.readFileSync(__dirname + '/zero.html', 'utf-8')
const pageCode = MASCARA_SUPPORT ? mascaraPageCode : regularPageCode

const ETHER = 1e18
const faucetAmountWei = (1 * ETHER)

console.log('Acting as faucet for address:', config.address)

// Lazy nonce tracking fix:
// Force an exit after ten minutes (docker will trigger a restart)
setTimeout(() => {
  console.log('Restarting for better nonce tracking')
  process.exit()
}, 10 * 60 * 1000)

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

  // serve app
  app.get('/', deliverPage)
  app.get('/index.html', deliverPage)
  app.get('/app.js', deliverApp)

  // add IP-based rate limiting
  app.post('/', new RateLimit({
    // 15 minutes
    windowMs: 15*60*1000,
    // limit each IP to N requests per windowMs
    max: 200,
    // disable delaying - full speed until the max limit is reached
    delayMs: 0,
  }))

  // handle fauceting request
  app.post('/', handleRequest)

  // start server
  const server = app.listen(PORT, function(){
    console.log('ethereum rpc listening on', PORT)
    console.log('and proxying to', config.rpcOrigin)
  })

  setupGracefulShutdown(server)


  async function handleRequest (req, res) {
    // parse ip-address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress

    // parse address
    const targetAddress = req.body
    if (targetAddress.slice(0,2) !== '0x') {
      targetAddress = '0x'+targetAddress
    }
    if (targetAddress.length !== 42) {
      return didError(new Error('Address parse failure - '+targetAddress))
    }

    console.log(`${ipAddress} requesting for ${targetAddress}`)

    try {
      // check for greediness
      const balance = await ethQuery.getBalance(targetAddress, 'pending')
      const balanceTooFull = balance.gt(new BN('10000000000000000000', 10))
      if (balanceTooFull) return didError(new Error('User is greedy.'))
      // send value
      const result = await ethQuery.sendTransaction({
        to: targetAddress,
        from: config.address,
        value: faucetAmountWei,
        data: '',
      })
      console.log('sent tx:', result)
      res.send(result)
    } catch (err) {
      return didError(err)
    }

    function didError(err){
      console.error(err.stack)
      res.status(500).json({ error: err.message })
    }

    function invalidRequest(){
      res.status(400).json({ error: 'Not a valid request.' })
    }

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

