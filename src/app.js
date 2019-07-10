const h = require("h")
const xhr = require("xhr")
const EthQuery = require("eth-query")
const metamask = require("metamascara")
const config = require("./get-config")
const { getSafeTokenInWallet } = require("./helpers/blockchain")

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

window.addEventListener("load", startApp)

function startApp() {
  // check environment
  if (!global.web3) {
    // abort
    if (!window.ENABLE_MASCARA) {
      render(h("span", "No web3 detected."))
      return
    }
    // start mascara
    const provider = metamask.createDefaultProvider({})
    global.web3 = { currentProvider: provider }
  }

  // create query helper
  const provider = global.web3.currentProvider
  global.ethQuery = new EthQuery(provider)
  global.provider = provider

  renderApp()
  updateStateFromNetwork()
  setInterval(updateStateFromNetwork, 4000)
}

function updateStateFromNetwork() {
  getNetwork()
  getAccounts()
  getBalances()
  renderApp()
}

function getNetwork() {
  global.provider.sendAsync(
    { id: 1, jsonrpc: "2.0", method: "net_version" },
    function(err, res) {
      if (err) return console.error(err)
      if (res.error) return console.res.error(res.error)
      var network = res.result
      state.network = network
      renderApp()
    }
  )
}

function getAccounts() {
  global.ethQuery.accounts(function(err, accounts) {
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
function requestAccounts() {
  const provider = global.web3.currentProvider
  if ("enable" in global.web3.currentProvider) {
    return provider
      .enable()
      .then(accounts => {
        getAccounts()
        return accounts[0]
      })
      .catch(err => {
        alert(
          "Your web3 account is currently locked. Please unlock it to continue."
        )
      })
  } else {
    // Fallback to old way if no privacy mode available
    if (state.userAddress) {
      return Promise.resolve(state.userAddress)
    } else {
      alert(
        "Your web3 account is currently locked. Please unlock it to continue."
      )
      return Promise.reject()
    }
  }
}

function getBalances() {
  if (state.faucetAddress) {
    getSafeTokenInWallet(state.faucetAddress).then(balance => {
      state.faucetBalance = balance
      renderApp()
    })
  }

  if (state.userAddress) {
    getSafeTokenInWallet(state.userAddress).then(balance => {
      state.fromBalance = balance
      renderApp()
    })
  }
}

function renderApp() {
  // if (state.isLoading) {
  //   return render(h('span', 'web3 detected - Loading...'))
  // }

  // render wrong network warning
  if (state.network === "1") {
    return render([
      h("section.container", [
        h("div.panel.panel-default", [
          h("div.panel-heading", [h("h3", "network")]),
          h("div.panel-body", [
            "currently on mainnet - please select the correct test network"
          ])
        ])
      ])
    ])
  }

  // render faucet ui
  render([
    h("nav.navbar.navbar-default", [
      h("h1.container-fluid", "Safe Token Faucet")
    ]),

    h("section.container", [
      h("div.panel.panel-default", [
        h("div.panel-heading", [h("h3", "faucet")]),
        h("div.panel-body", [
          h("div", "address: " + state.faucetAddress),
          h("div", "balance: " + formatBalance(state.faucetBalance)),
          h(
            "button.btn.btn-success",
            `request ${config.amount} SAFE from faucet`,
            {
              style: {
                margin: "4px"
              },
              // disabled: state.userAddress ? null : true,
              click: getEther
            }
          )
        ])
      ]),

      h("div.panel.panel-default", [
        h("div.panel-heading", [h("h3", "user")]),
        h("div.panel-body", [
          h("div", "address: " + state.userAddress),
          h("div", "balance: " + formatBalance(state.fromBalance)),
          h("div", "donate to faucet:"),
          h("button.btn.btn-warning", "1 SAFE", {
            style: {
              margin: "4px"
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 1)
          }),
          h("button.btn.btn-warning", "10 SAFE", {
            style: {
              margin: "4px"
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 10)
          }),
          h("button.btn.btn-warning", "100 SAFE", {
            style: {
              margin: "4px"
            },
            // disabled: state.userAddress ? null : true,
            click: sendTx.bind(null, 100)
          })
        ])
      ]),

      h("div.panel.panel-default", [
        h("div.panel-heading", [h("h3", "transactions")]),
        h(
          "div.panel-body",
          {
            style: {
              "flex-direction": "column",
              display: "flex"
            }
          },
          state.transactions.map(txHash => {
            return link(`https://ropsten.etherscan.io/tx/${txHash}`, txHash)
          })
        )
      ])
    ]),
    state.errorMessage
      ? h("div", { style: { color: "red" } }, state.errorMessage)
      : null
  ])
}

function link(url, content) {
  return h("a", { href: url, target: "_blank" }, content)
}

function getEther() {
  requestAccounts().then(function(account) {
    // We already prompted to unlock in requestAccounts()
    if (!account) return

    var uri = window.location.href
    var http = new XMLHttpRequest()
    var data = account

    xhr(
      {
        method: "POST",
        body: data,
        uri: uri,
        headers: {
          "Content-Type": "application/rawdata"
        }
      },
      function(err, resp, body) {
        // display error
        if (err) {
          state.errorMessage = err || err.stack
          return
        }
        // display error-in-body
        try {
          if (body.slice(0, 2) === "0x") {
            state.transactions.push(body)
          } else {
            state.errorMessage = body
          }
        } catch (err) {
          state.errorMessage = err || err.stack
        }
        // display tx hash
        console.log("faucet response:", body)
        updateStateFromNetwork()
      }
    )
  })
}

function sendTx(value) {
  requestAccounts().then(address => {
    if (!address) return

    global.ethQuery.sendTransaction(
      {
        from: address,
        to: state.faucetAddress,
        value: "0x" + (value * 1e18).toString(16)
      },
      function(err, txHash) {
        if (err) {
          state.errorMessage = err && err.stack
        } else {
          console.log("user sent tx:", txHash)
          state.errorMessage = null
          state.transactions.push(txHash)
        }
        updateStateFromNetwork()
      }
    )
  })
}

function render(elements) {
  if (!Array.isArray(elements)) elements = [elements]
  elements = elements.filter(Boolean)
  // clear
  document.body.innerHTML = ""
  // insert
  elements.forEach(function(element) {
    document.body.appendChild(element)
  })
}

function formatBalance(balance) {
  return balance ? balance + " SAFE" : "..."
}
