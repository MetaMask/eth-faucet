'use strict'
const http = require('http')
const { parse: parseUrl } = require('url')
const ethers = require('ethers')

const ganacheUrl = 'http://localhost:8545'
const faucetUrl = 'http://localhost:9000'

const provider = new ethers.providers.JsonRpcProvider()

start()

async function start() {
  while (true) {
    try {
      await Promise.all(
        // multiple simultaneous requests
        Array(5).fill().map(randomRequest)
      )
    } catch (err) {
      console.error(err)
    }
  }
}

async function randomRequest () {
  const number = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
  const numberString = number.toString(16)
  const padding = '0'.repeat(40 - numberString.length)
  const address = `0x${padding}${numberString}`
  const txHash = await requestEther(address)
  await transactionConfirmed(txHash)
}

async function requestEther (address) {
  const txHash = await postData(faucetUrl, address)
  return txHash
}

async function transactionConfirmed (txHash) {
  while (true) {
    const txRx = await provider.getTransactionReceipt(txHash)
    if (txRx.blockHash) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

function postData (url, data) {
  return new Promise((resolve, reject) => {
    const dataBuffer = Buffer.from(data, 'utf8')
    const { protocol, hostname, port, path } = parseUrl(url)
    if (protocol !== 'http:') {
      throw new Error(`Unsupported protocol "${protocol}" in url "${url}"`) 
    }

    const options = {
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'content-length': dataBuffer.length,
        'content-type': 'application/x-www-form-urlencoded'
      }
    }

    const req = http.request(options, res => {
      let respData = ''

      res.on('data', data => {
        respData += data.toString()
      })

      res.once('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`request failed: ${res.statusCode}: ${respData}`))
        }
        resolve(respData)
      })
    })

    req.once('error', error => {
      console.log('yeet')
      reject(error)
    })

    req.write(dataBuffer)
    req.end()
  })
}