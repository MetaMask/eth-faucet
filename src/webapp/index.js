const h = require('h')
const fetch = require('cross-fetch');
const EthQuery = require('eth-query')

var state = {
  isLoading: true,

  // injected at build time
  faucetAddress: process.env.FAUCET_ADDRESS,
  faucetBalance: null,

  userAddress: null,
  fromBalance: null,
  errorMessage: null,

  transactions: []
}

window.addEventListener('load', startApp)

function startApp () {

  // attempt to get provider from environment
  let provider
  if (global.ethereum) {
    provider = global.ethereum
  } else if (global.web3) {
    provider = global.web3.currentProvider
  }

  // display warning if incompatible
  if (!provider) {
    // abort
    render(h('span', 'No ethereum provider detected. Install a web-enabled wallet (eg MetaMask metamask.io) to continue'))
    return
  }

  // create query helper
  global.ethQuery = new EthQuery(provider)
  global.provider = provider

  renderApp()
  updateStateFromNetwork()
  setInterval(updateStateFromNetwork, 4000)
}

function updateStateFromNetwork () {
  getChainId()
  getAccounts()
  getBalances()
  renderApp()
}

function getChainId () {
  global.provider.sendAsync({ id: 1, jsonrpc: '2.0', method: 'eth_chainId' }, function (err, res) {
    if (err) return console.error(err)
    if (res.error) return console.res.error(res.error)
    var chainId = res.result
    state.chainId = chainId
    renderApp()
  })
}

function getAccounts () {
  global.ethQuery.accounts(function (err, accounts) {
    if (err) return console.error(err)
    var address = accounts[0]
    if (state.userAddress === address) return
    state.userAddress = address
    state.fromBalance = null
    getBalances()
    renderApp()
  })
}

/*
 * The big new method added for EIP-1102 privacy mode compatibility.
 * Read more here:
 * https://medium.com/metamask/eip-1102-preparing-your-dapp-5027b2c9ed76
 */
async function requestAccounts () {
  const provider = global.provider
  if ('enable' in provider) {
    try {
      const accounts = await provider.enable()
      getAccounts()
      return accounts[0]
    } catch (err) {
      window.alert('Your web3 account is currently locked. Please unlock it to continue.')
    }
  } else {
    // Fallback to old way if no privacy mode available
    if (state.userAddress) {
      return state.userAddress
    } else {
      window.alert('Your web3 account is currently locked. Please unlock it to continue.')
      throw new Error('web3 account locked')
    }
  }
}

function getBalances () {
  if (state.faucetAddress) {
    global.ethQuery.getBalance(state.faucetAddress, function (err, result) {
      if (err) return console.error(err)
      state.faucetBalance = (parseInt(result, 16) / 1e18).toFixed(2)
      renderApp()
    })
  }

  if (state.userAddress) {
    global.ethQuery.getBalance(state.userAddress, function (err, result) {
      if (err) return console.error(err)
      state.fromBalance = (parseInt(result, 16) / 1e18).toFixed(2)
      renderApp()
    })
  }
}

function renderApp () {
  // if (state.isLoading) {
  //   return render(h('span', 'web3 detected - Loading...'))
  // }

  // render wrong chain id warning
  if (state.chainId === '1') {
    return render([

      h('section.container', [
        h('div.panel.panel-default', [
          h('div.panel-heading', [
            h('h3', 'network')
          ]),
          h('div.panel-body', [
            'currently on mainnet - please select the correct test network'
          ])
        ])
      ])

    ])
  }

  // render faucet ui
  render([

    h('nav.navbar.navbar-default', [
      h('h1.container-fluid', 'MetaMask Ether Faucet')
    ]),

    h('section.container', [

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'faucet')
        ]),
        h('div.panel-body', [
          h('div', 'address: ' + state.faucetAddress),
          h('div', 'balance: ' + formatBalance(state.faucetBalance)),
          h('button.btn.btn-success', 'request 1 ether from faucet', {
            style: {
              margin: '4px'
            },
            // disabled: state.userAddress ? null : true,
            click: getEther
          })
        ])
      ]),

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'user')
        ]),
        h('div.panel-body', [
          h('div', 'address: ' + state.userAddress),
          h('div', 'balance: ' + formatBalance(state.fromBalance)),
          h('div', 'donate to faucet:'),
          h('button.btn.btn-warning', '1 ether', {
            style: {
              margin: '4px'
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 1)
          }),
          h('button.btn.btn-warning', '10 ether', {
            style: {
              margin: '4px'
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 10)
          }),
          h('button.btn.btn-warning', '100 ether', {
            style: {
              margin: '4px'
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 100)
          })
        ])
      ]),

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'transactions')
        ]),
        h('div.panel-body', {
          style: {
            'flex-direction': 'column',
            display: 'flex'
          }
        }, (
          state.transactions.map((txHash) => {
            return link(`https://ropsten.etherscan.io/tx/${txHash}`, txHash)
          })
        ))
      ])

    ]),

    state.errorMessage ? h('div', { style: { color: 'red' } }, state.errorMessage) : null

  ])
}

function link (url, content) {
  return h('a', { href: url, target: '_blank' }, content)
}

async function getEther () {
  const account = await requestAccounts()

  // We already prompted to unlock in requestAccounts()
  if (!account) return

  var uri = `${window.location.href}v0/request`
  var data = account

  let res, body, err
  
  try {
    res = await fetch(uri, {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/rawdata'
      }
    })
    body = await res.text()
  } catch (error) {
    err = error
  }

  // display error
  if (err) {
    state.errorMessage = err || err.stack
    return
  }

  if (res.status === 420) {
    state.errorMessage = `Being ratelimited... try again later`
    return
  }

  if (!res.ok) {
    state.errorMessage = `Error: ${res.status} ${res.statusText} ${body}`
    return
  }

  // display error-in-body
  try {
    if (body.slice(0, 2) === '0x') {
      state.transactions.push(body)
      state.errorMessage = null
    } else {
      state.errorMessage = body
    }
  } catch (err) {
    state.errorMessage = err || err.stack
  }

  // display tx hash
  console.log('faucet response:', body)
  updateStateFromNetwork()
}

async function sendTx (value) {
  const address = await requestAccounts()
  if (!address) return

  global.ethQuery.sendTransaction({
    from: address,
    to: state.faucetAddress,
    value: '0x' + (value * 1e18).toString(16)
  }, function (err, txHash) {
    if (err) {
      state.errorMessage = (err && err.stack)
    } else {
      console.log('user sent tx:', txHash)
      state.errorMessage = null
      state.transactions.push(txHash)
    }
    updateStateFromNetwork()
  })
}

function render (elements) {
  if (!Array.isArray(elements)) elements = [elements]
  elements = elements.filter(Boolean)
  // clear
  document.body.innerHTML = ''
  // insert
  elements.forEach(function (element) {
    document.body.appendChild(element)
  })
}

function formatBalance (balance) {
  return balance ? balance + ' ether' : '...'
}
