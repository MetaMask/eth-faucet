const request = require('request')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const PORT = process.env.PORT ||  9000
const RPC_NODE = process.env.RPC_NODE
const METHOD_WHITELIST =
  process.env.METHOD_WHITELIST
  ? process.env.METHOD_WHITELIST.split(',')
  : ['eth_getBalance', 'eth_getStorage', 'eth_getBlock', 'eth_gasPrice']

const app = express()
app.use(cors())
app.use(bodyParser.json())

app.post('/', function(req, res){
  var requestObject = req.body
  if (!validateRequest( requestObject )) return res.status(400).send('Not a valid request.')
  if (!checkWhitelist( requestObject.method )) return res.status(400).send('Not a valid method.')
  request.post({
    uri: 'http://'+RPC_NODE,
    json: requestObject,
  }).pipe(res)
})

app.listen(PORT, function(){
  console.log('ethereum rpc listening on', PORT)
})

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