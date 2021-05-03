### eth-faucet

[![Greenkeeper badge](https://badges.greenkeeper.io/MetaMask/eth-faucet.svg?token=126240abfcbf915f71b337dfc332d4ad63e362166827d61078593e2ae20aff36&ts=1501793671323)](https://greenkeeper.io/)

configure:
create a `config.js` with private key and rpc endpoint.
first namespace is used in `docker-compose.yml`.
```
cp config.js.example config.js
```

Or pass the environment variable `FAUCET_CONFIG_LOCATION` to the build step.

### development:

Running `yarn setup` will install and prepare dependencies.

Running `yarn build` will prepare the webapp.

Running `yarn start` starts the server.

Will not work without a `config.js` file specified. You can run it with `ganache-cli` by pasting one of your generated private keys into a file like this:

```javascript
module.exports = {
  'ropsten': {
    'privateKey': '0xe2e5b850dd3974c6d296ccd69556fc2dc57484206b3411e5e3de1fc54f5afcf8',
    'rpcOrigin': 'http://127.0.0.1:8545'
  }
}
```

### note:
the faucet regularly restarts to ensure its in a good state

### deploy:
continuous deployment is setup via github actions and kubernetes
