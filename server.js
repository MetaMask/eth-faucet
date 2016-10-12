const request = require('request')
const express = require('express')
const Browserify = require('browserify')
const bodyParser = require('body-parser')
const cors = require('cors')
const RateLimit = require('express-rate-limit')
const Web3 = require('web3')
const BN = require('bn.js')
const ethUtil = require('./ethUtil')
const rpcWrapperEngine = require('./index.js')
const pageCode = require('fs').readFileSync('./index.html', 'utf-8')

const PORT = process.env.PORT || 9000
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x693148ab1226b1c6536bcf240079bcb36a12cd1c8e4f42468903c734d22718be'
if (!PRIVATE_KEY) throw new Error('Env var PRIVATE_KEY not specified.')
const RPC_NODE = process.env.RPC_NODE || 'https://morden.infura.io/'
if (!RPC_NODE) throw new Error('Env var RPC_NODE not specified.')

// calculate faucet address
var faucetKey = ethUtil.toBuffer(PRIVATE_KEY)
var faucetAddress = ethUtil.privateToAddress(faucetKey)
var faucetAddressHex = '0x'+faucetAddress.toString('hex')
var ether = 1e18
var weiValue = 1*ether

console.log('Acting as faucet for address:', faucetAddressHex)

//
// create engine
//

// ProviderEngine based caching layer, with fallback to geth
var engine = rpcWrapperEngine({
  rpcUrl: RPC_NODE,
  addressHex: faucetAddressHex,
  privateKey: faucetKey,
})

var web3 = new Web3(engine)

var browserify = Browserify()
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
    web3.eth.getBalance(targetAddress, function(err, balance){
      if (err) return didError(err)
      var balanceTooFull = balance.gt(new BN('5e18'))
      if (balanceTooFull) return didError(new Error('User is greedy.'))
      // send value
      web3.eth.sendTransaction({
        to: targetAddress,
        from: faucetAddressHex,
        value: weiValue,
      }, function(err, result){
        if (err) return didError(err)
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
    console.log('and proxying to', RPC_NODE)
  })

  function deliverPage(req, res){
    res.status(200).send(pageCode)
  }

  function deliverApp(req, res){
    res.status(200).send(appCode)
  }

}

// example request format
//
// {
// "jsonrpc": "2.0",
// "method": "eth_getBalance",
// "params": ["0x407d73d8a49eeb85d32cf465507dd71d507100c1", "latest"],
// "id":1
// }

function validateRequest( requestObject ){
  return typeof requestObject === 'object' && !!requestObject.method
}

