const environment = process.env.FAUCET_CONFIG || 'ropsten'
const ethUtil = require('ethereumjs-util')
const allConfigs = require('../config.js')
const config = allConfigs[environment]
if (!config) throw new Error(`Unable to find config for environment "${environment}"`)
if (!config.privateKey) throw new Error('No "privateKey" specified in config.')
if (!config.rpcOrigin) throw new Error('No "rpcOrigin" specified in config.')

// calculate faucet address
const faucetKey = ethUtil.toBuffer(config.privateKey)
const faucetAddress = ethUtil.privateToAddress(faucetKey)
const faucetAddressHex = ethUtil.bufferToHex(faucetAddress)
config.address = faucetAddressHex

module.exports = config