### eth-faucet

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