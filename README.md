### eth-faucet

[![Greenkeeper badge](https://badges.greenkeeper.io/MetaMask/eth-faucet.svg?token=126240abfcbf915f71b337dfc332d4ad63e362166827d61078593e2ae20aff36&ts=1501793671323)](https://greenkeeper.io/)

configure:
edit config.js to have your config details.
first namespace is used in `docker-compose.yml`.
```
cp config.js.example config.js
```

deploy:
```
docker-compose build && docker-compose stop && docker-compose up -d && docker-compose logs -f --tail 10
```

### note:
our nonce tracking sucks, so dont reuse the key or you'll have to restart the faucet.

### deploy:
docker-compose build && docker-compose stop && docker-compose up -d && docker-compose logs -f