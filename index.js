const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js')
const request = require('request')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const PORT = process.env.PORT ||  9000
const RPC_NODE = process.env.RPC_NODE || 'https://testrpc.metamask.io/'
const METHOD_WHITELIST =
  process.env.METHOD_WHITELIST
  ? process.env.METHOD_WHITELIST.split(',')
  : [
    'eth_gasPrice',
    'eth_blockNumber',
    'eth_getBalance',
    'eth_getBlockByHash',
    'eth_getBlockByNumber',
    'eth_getBlockTransactionCountByHash',
    'eth_getBlockTransactionCountByNumber',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_getTransactionByBlockHashAndIndex',
    'eth_getTransactionByBlockNumberAndIndex',
    'eth_getTransactionByHash',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_getUncleByBlockHashAndIndex',
    'eth_getUncleByBlockNumberAndIndex',
    'eth_getUncleCountByBlockHash',
    'eth_getUncleCountByBlockNumber',
    'eth_sendRawTransaction',
    'eth_getLogs',
    ]

const app = express()
app.use(cors())
app.use(bodyParser.text({ type: '*/*' }))

// ProviderEngine based caching layer, with fallback to geth
var proxyUrl = RPC_NODE
var rpcProvider = CacheLayerProvider({
  rpcUrl: proxyUrl,
})

app.post('/', function(req, res){
  
  // parse request
  try {
    var requestObject = JSON.parse(req.body)
  } catch (err) {
    return didError(new Error('JSON parse failure - '+err.message))
  }

  // validate request
  if (!validateRequest( requestObject )) return invalidRequest()
  if (!checkWhitelist( requestObject.method )) return invalidMethod()

  // process request
  rpcProvider.sendAsync(requestObject, function(err, result){
    if (err) {
      didError(err)
    } else {
      console.log('RPC:', requestObject.method, requestObject.params)//, '->', result.result || result.error)
      res.send(result)
    }
  })

  function didError(err){
    console.error(err.stack)
    res.status(500).json({ error: err.message })
  }

  function invalidRequest(){
    res.status(400).json({ error: 'Not a valid request.' })
  }

  function invalidMethod(){
    res.status(400).json({ error: 'Not a permitted RPC method.' })
  }

})

app.listen(PORT, function(){
  console.log('ethereum rpc listening on', PORT)
  console.log('and proxying to', proxyUrl)
})

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

function checkWhitelist( requestMethod ){
  return METHOD_WHITELIST.indexOf(requestMethod) !== -1
}

function CacheLayerProvider(opts){
  opts = opts || {}

  var engine = new ProviderEngine()

  // data source
  var rpcSubprovider = new RpcSubprovider({
    rpcUrl: opts.rpcUrl || 'https://testrpc.metamask.io/',
  })
  engine.addSource(rpcSubprovider)

  // done adding subproviders
  engine.start()

  engine.on('block', function(block){
    console.log('BLOCK CHANGED:', '#'+block.number.toString('hex'), '0x'+block.hash.toString('hex'))
  })

  return engine
}