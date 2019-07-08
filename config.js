const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  ropsten: {
    rpcOrigin: 'https://ropsten.infura.io',
    privateKey: process.env.PRIVATE_KEY,
    tokenAddress: process.env.TOKEN_ADDRESS,
    amount: 100,
    decimals: 18,
    gas: 60000
  },
}
