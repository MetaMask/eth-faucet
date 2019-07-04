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
const EtherBN = new BN('1000000000000000000', 10)
const MAX_BALANCE = EtherBN.mul(new BN('4', 10))
const AUTO_RESTART_INTERVAL = 60 * min
const metamask = require('metamascara')
const minimal_abi = require('./safe_token_abi');
let contract, decimals;

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

// check environment
if (!global.web3) {
  // abort
  if (!window.ENABLE_MASCARA) {
    render(h('span', 'No web3 detected.'))
    return
  }
  // start mascara
  const provider = metamask.createDefaultProvider({})
  global.web3 = { currentProvider: provider }
}

// load SafeToken contract
const faucetEthBalance = await global.web3.eth.getBalance(config.address);
if(faucetEthBalance === 0) {
  console.error(`ERR: Faucet account ${config.address} has no funds for tx fees.`);
  process.exit(1);
}

contract = new global.web3.eth.Contract(minimal_abi, config.tokenAddress, { from: config.address });
console.log(`contract initialized at ${config.tokenAddress}`);

try {
  decimals = await contract.methods.decimals().call();
  console.log(`token has ${decimals} decimals`);
} catch(e) {
  console.log(`ERR: there seems to be no ERC-20 compatible contract at address ${config.tokenAddress} on this network`);
  process.exit(1);
}
const faucetAmountWei = (config.amount * Math.pow(10, decimals))

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
    delayMs: 200,
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
  // Force an exit (docker will trigger a restart)
  setTimeout(() => {
    console.log('Restarting for better nonce tracking')
    shutdown()
  }, AUTO_RESTART_INTERVAL)

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
      refuelAccount(targetAddress, (err, txHash) => {
        // this is an ugly workaround needed because web3 may throw an error after giving us a txHash
        if(res.finished) return;
  
        if(err) {
          res.writeHead(500, {'Content-Type': 'text/plain'});
          res.end(`${err}\n`);
        }
        if(txHash) {
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end(`txHash: ${txHash}\n`);
        }
      });
      console.log(`${requestorMessage} - sent tx: ${txHash}`)
      

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

  // sends some tokens to the given account <userAddr>, invokes the given callback with the resulting transaction hash
  async function refuelAccount(userAddr, callback) {
    console.log(`sending ${faucetAmountWei} tokens to ${userAddr}...`);

    const txObj = {
      from: config.address,
      to: config.tokenAddress,
      data: contract.methods.transfer(userAddr, new BN(faucetAmountWei).mul(new BN(10).pow(new BN(decimals))).toString()).encodeABI(),
      gas: config.gas
    };
    const signedTxObj = await web3.eth.accounts.signTransaction(txObj, config.privateKey);

    web3.eth.sendSignedTransaction(signedTxObj.rawTransaction)
      .once('transactionHash', function (txHash) {
        console.log(`waiting for processing of token transfer transaction ${txHash}`);
        callback(null, txHash);
      })
      .once('receipt', function (receipt) {
        if (! receipt.status) {
          console.error(`token transfer transaction ${receipt.transactionHash} failed`);
        } else {
          console.log(`token transfer transaction ${receipt.transactionHash} executed in block ${receipt.blockNumber} consuming ${receipt.gasUsed} gas`);
        }
      })
      .on('error', function (err) {
        console.error(`token transfer transaction failed: ${err}`);
        callback(err, null);
      });
  }
}
