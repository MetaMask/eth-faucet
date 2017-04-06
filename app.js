const h = require('h')
const xhr = require('xhr')
const config = require('./get-config')


var state = {
  isLoading: true,

  faucetAddress: config.address,
  faucetBalance: null,

  userAddress: null,
  fromBalance: null,
  errorMessage: null,

  transactions: [],
}

window.addEventListener('load', startApp)


function startApp(){
  // check environment
  if (!global.web3) {
    render(h('span', 'No web3 detected.'))
    return
  }

  renderApp()
  updateStateFromNetwork()
  setInterval(updateStateFromNetwork, 4000)
}

function updateStateFromNetwork(){
  getAccounts()
  getBalances()
  renderApp()
}

function getAccounts(){
  web3.eth.getAccounts(function(err, accounts){
    if (err) return console.error(err)
    var address = accounts[0]
    if (state.userAddress === address) return
    state.userAddress = address
    state.fromBalance = null
    getBalances()
    renderApp()
  })
}

function getBalances(){
  if (state.faucetAddress)  web3.eth.getBalance(state.faucetAddress, function(err, result){
    if (err) return console.error(err)
    state.faucetBalance = result.toNumber()/1e18
    renderApp()
  })
  if (state.userAddress) web3.eth.getBalance(state.userAddress, function(err, result){
    if (err) return console.error(err)
    state.fromBalance = result.toNumber()/1e18
    renderApp()
  })
}

function renderApp(){
  // if (state.isLoading) {
  //   return render(h('span', 'web3 detected - Loading...'))
  // }

  render([

    h('nav.navbar.navbar-default', [
      h('h1.container-fluid', 'MetaMask Ether Faucet')
    ]),    

    h('section.container', [

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'faucet'),
        ]),
        h('div.panel-body', [
          h('div', 'address: '+state.faucetAddress),
          h('div', 'balance: '+formatBalance(state.faucetBalance)),
          h('button.btn.btn-success', 'request 1 ether from faucet', {
            style: {
              margin: '4px',
            },
            // disabled: state.userAddress ? null : true,
            click: getEther,
          }),
        ]),
      ]),

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'user'),
        ]),
        h('div.panel-body', [
          h('div', 'address: '+state.userAddress),
          h('div', 'balance: '+formatBalance(state.fromBalance)),
          h('div', 'donate to faucet:'),
          h('button.btn.btn-warning', '1 ether', {
            style: {
              margin: '4px',
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 1),
          }),
          h('button.btn.btn-warning', '10 ether', {
            style: {
              margin: '4px',
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 10),
          }),
          h('button.btn.btn-warning', '100 ether', {
            style: {
              margin: '4px',
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 100),
          }),
        ]),
      ]),

      h('div.panel.panel-default', [
        h('div.panel-heading', [
          h('h3', 'transactions'),
        ]),
        h('div.panel-body', {
          style: {
            'flex-direction': 'column',
            display: 'flex',
          }
        }, (
          state.transactions.map((txHash) => {
            return link(`https://ropsten.etherscan.io/tx/${txHash}`, txHash)
          })
        ))
      ]),
      
    ]),

    state.errorMessage ? h('div', { style: { color: 'red', } }, state.errorMessage) : null,

  ])
}

function link(url, content){
  return h('a', { href: url, target: '_blank' }, content)
}

function getEther(){
  if (!state.userAddress) return alert('no user accounts found')
  var uri = window.location.href
  var http = new XMLHttpRequest()
  var data = state.userAddress

  xhr({
    method: 'POST',
    body: data,
    uri: uri,
    headers: {
      'Content-Type': 'application/rawdata',
    }
  }, function (err, resp, body) {
    // display error
    if (err) {
      state.errorMessage = err || err.stack
      return
    }
    // display error-in-body
    try {
      if (body.slice(0,2) === '0x') {
        state.transactions.push(body)
      } else {
        state.errorMessage = body
      }
    } catch (err) {
      state.errorMessage = err || err.stack
    }
    // display tx hash
    console.log('faucet response:', body)
    updateStateFromNetwork()
  })
}

function sendTx(value){
  if (!state.userAddress) return alert('no user accounts found')
  web3.eth.sendTransaction({
    from: state.userAddress,
    to: state.faucetAddress,
    value: '0x'+(value*1e18).toString(16),
  }, function(err, txHash){
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

function render(elements){
  if (!Array.isArray(elements)) elements = [elements]
  elements = elements.filter(Boolean)
  // clear
  document.body.innerHTML = ''
  // insert
  elements.forEach(function(element){
    document.body.appendChild(element)
  })
}

function formatBalance(balance){
  return balance ? balance+' ether' : '...'
}