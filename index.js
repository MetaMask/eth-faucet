const Transaction = require('ethereumjs-tx')
const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js')
const HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js')

module.exports = rpcWrapperEngine

function rpcWrapperEngine(opts){
  opts = opts || {}

  var engine = opts.engine || new ProviderEngine()

  // tx signing
  var privateKey = opts.privateKey
  var addresses = [opts.addressHex]

  engine.addProvider(new HookedWalletSubprovider({
    getAccounts: function(cb){
      cb(null, addresses)
    },
    signTransaction: function(txParams, cb){
      try {
        console.log('signing tx:', txParams)
        var tx = new Transaction({
          nonce: txParams.nonce,
          to: txParams.to,
          value: txParams.value,
          data: txParams.input,
          gasPrice: txParams.gasPrice,
          gasLimit: txParams.gas,
        })
        tx.sign(privateKey)
        var serializedTx = '0x'+tx.serialize().toString('hex')
        cb(null, serializedTx)
      } catch (err) {
        cb(err)
      }
    },
  }))

  // data source
  engine.addProvider(new RpcSubprovider({
    rpcUrl: opts.rpcUrl,
  }))

  // log new blocks
  // engine.on('block', function(block){
  //   console.log('BLOCK CHANGED:', '#'+block.number.toString('hex'), '0x'+block.hash.toString('hex'))
  // })

  // start polling
  engine.start()

  return engine
}