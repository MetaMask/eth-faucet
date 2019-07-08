const safeToken = require("../safe_token_abi")
const config = require("./get-config")
const Web3 = require("web3")
let web3
web3 = new Web3(new Web3.providers.HttpProvider(config.rpcOrigin))

const getSafeTokenInWallet = async walletAddress => {
  const safeContract = new web3.eth.Contract(safeToken, config.tokenAddress)
  const balance = await getBalance(safeContract, walletAddress)
  return web3.utils.fromWei(web3.utils.toBN(balance))
}

const getBalance = (contract, walletAddress) => {
  return contract.methods
    .balanceOf(walletAddress)
    .call()
    .then(safe => safe)
}

module.exports = getSafeTokenInWallet
