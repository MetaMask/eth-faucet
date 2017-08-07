const MASCARA_SUPPORT = process.env.MASCARA_SUPPORT
const PORT = process.env.PORT || 9000

const express = require('express')
const Browserify = require('browserify')
const envify = require('envify/custom')
const bodyParser = require('body-parser')
const cors = require('cors')
const RateLimit = require('express-rate-limit')
const Web3 = require('web3')
const BN = require('bn.js')
const ethUtil = require('ethereumjs-util')
const config = require('./get-config')
const rpcWrapperEngine = require('./index.js')
const regularPageCode = require('fs').readFileSync('./index.html', 'utf-8')
const mascaraPageCode = require('fs').readFileSync('./zero.html', 'utf-8')
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
var engine = rpcWrapperEngine({
  rpcUrl: config.rpcOrigin,
  addressHex: config.address,
  privateKey: ethUtil.toBuffer(config.privateKey),
})

var web3 = new Web3(engine)

// prepare app bundle
var browserify = Browserify()
// inject faucet address
browserify.transform(envify({
  FAUCET_ADDRESS: config.address,
}))
// build app
browserify.add('./app.js')
browserify.bundle(function(err, bundle){
  if (err) throw err
  var appCode = bundle.toString()
  startServer(appCode)
})

//
// create webserver
//
function startServer(appCode) {

  const app = express()
  app.use(cors())
  app.use(bodyParser.text({ type: '*/*' }))

  // serve app
  app.get('/', deliverPage)
  app.get('/index.html', deliverPage)
  app.get('/app.js', deliverApp)

  // send ether
  app.enable('trust proxy')
  // add IP-based rate limiting
  app.post('/', new RateLimit({
    // 15 minutes
    windowMs: 15*60*1000,
    // limit each IP to N requests per windowMs
    max: 200,
    // disable delaying - full speed until the max limit is reached
    delayMs: 0,
  }))
  // the fauceting request
  app.post('/', function(req, res){

    // address: 18a3462427bcc9133bb46e88bcbe39cd7ef0e761
    // priv: 693148ab1226b1c6536bcf240079bcb36a12cd1c8e4f42468903c734d22718be

    // parse request
    var targetAddress = req.body
    if (targetAddress.slice(0,2) !== '0x') {
      targetAddress = '0x'+targetAddress
    }
    if (targetAddress.length !== 42) {
      return didError(new Error('Address parse failure - '+targetAddress))
    }

    // check for greediness
    web3.eth.getBalance(targetAddress, 'pending', function(err, balance){
      if (err) return didError(err)
      var balanceTooFull = balance.gt(new BN('10000000000000000000', 10))
      if (balanceTooFull) return didError(new Error('User is greedy.'))
      // send value
      web3.eth.sendTransaction({
        to: targetAddress,
        from: config.address,
        value: faucetAmountWei,
      }, function(err, result){
        if (err) return didError(err)
        console.log('sent tx:', result)
        res.send(result)
      })
    })

    function didError(err){
      console.error(err.stack)
      res.status(500).json({ error: err.message })
    }

    function invalidRequest(){
      res.status(400).json({ error: 'Not a valid request.' })
    }

  })

  app.listen(PORT, function(){
    console.log('ethereum rpc listening on', PORT)
    console.log('and proxying to', config.rpcOrigin)
  })

  function deliverPage(req, res){
    res.status(200).send(pageCode)
  }

  function deliverApp(req, res){
    res.status(200).send(appCode)
  }

}
