### eth-faucet

[![Greenkeeper badge](https://badges.greenkeeper.io/MetaMask/eth-faucet.svg?token=126240abfcbf915f71b337dfc332d4ad63e362166827d61078593e2ae20aff36&ts=1501793671323)](https://greenkeeper.io/)

#### configure:
generate a configuration using the provided script, and template file `config.js.template`.
```
python config.py --privatekey-file pkfile --rpc-endpoint 'localhost:8545' --template config.js.template > config.js
```

### note:
our nonce tracking sucks, so we shutdown the faucet regularly

### deploy:
```
docker-compose build && docker-compose stop && docker-compose up -d && docker-compose logs -f
```
