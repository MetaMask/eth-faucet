const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js')
const CacheSubprovider = require('web3-provider-engine/subproviders/cache.js')
const VMSubprovider = require('web3-provider-engine/subproviders/vm.js')

module.exports = rpcWrapperEngine

function rpcWrapperEngine(opts){
  opts = opts || {}

  var engine = opts.engine || new ProviderEngine()

  engine.addSource(new CacheSubprovider())

  // data source
  engine.addSource(new RpcSubprovider({
    rpcUrl: opts.rpcUrl,
  }))

  return engine
}