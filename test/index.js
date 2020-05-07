'use strict'
const http = require('http')
const test = require('tape')
const ethers = require('ethers')

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')


test('basic withdrawal test', async (t) => {
  const address = '0x1000000000000000000000000000000000000000'
  const balanceBefore = await getBalance(address)
  t.equal(balanceBefore, '0')
  const txHash = await requestEther(address)
  await transactionConfirmed(txHash)
  const balanceAfter = await getBalance(address)
  t.equal(balanceAfter, '1000000000000000000')
  t.end()
})

async function getBalance (address) {
  const balance = await provider.getBalance(address)
  return balance.toString()
}

async function requestEther (address) {
  const txHash = await postData('localhost:9000', address)
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
    const [hostname, port] = url.split(':')
    const options = {
      hostname,
      port,
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

    req.on('error', error => {
      reject(error)
    })

    req.write(dataBuffer)
    req.end()
  })
}