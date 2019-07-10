const PORT = process.env.PORT || 9000
const MASCARA_SUPPORT = process.env.MASCARA_SUPPORT
const fs = require("fs")
const express = require("express")
const Browserify = require("browserify")
const envify = require("envify/custom")
const bodyParser = require("body-parser")
const cors = require("cors")
const RateLimit = require("express-rate-limit")
const geoIp = require("@pablopunk/geo-ip")
const emojiFlag = require("emoji-flag")
const { didError, deliverApp, deliverPage } = require("./helpers/server.js")
const {
  refuelAccount,
  getSafeTokenInWallet,
} = require("./helpers/blockchain")

const regularPageCode = fs.readFileSync(__dirname + "/index.html", "utf-8")
const mascaraPageCode = fs.readFileSync(__dirname + "/zero.html", "utf-8")
const pageCode = MASCARA_SUPPORT ? mascaraPageCode : regularPageCode

const config = require("./get-config")

const min = 60 * 1000
const faucetAmountWei = config.amount * Math.pow(10, config.decimals)
const AUTO_RESTART_INTERVAL = 60 * min

console.log("[FAUCET] Acting as faucet for address:", config.address)

// prepare app bundle
const browserify = Browserify()
// inject faucet address
browserify.transform(
  envify({
    FAUCET_ADDRESS: config.address
  })
)
// build app
browserify.add(__dirname + "/app.js")
browserify.bundle(function(err, bundle) {
  if (err) throw err
  const appCode = bundle.toString()
  startServer(appCode)
})

//
// create webserver
//
const startServer = appCode => {
  const app = express()
  // set CORS headers
  app.use(cors())
  // parse body
  app.use(bodyParser.text({ type: "*/*" }))
  // trust the "x-forwarded-for" header from our reverse proxy
  app.enable("trust proxy")

  // configure rate limiter
  const rateLimiter = new RateLimit({
    // 15 minutes
    windowMs: 15 * min,
    // limit each IP to N requests per windowMs
    max: 20,
    // disable delaying - full speed until the max limit is reached
    delayMs: 200
  })

  handleRequest = async (req, res) => {
    try {
      // parse ip-address
      const ipAddress =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress

      let flag
      try {
        const geoData = geoIp({ ip: ipAddress })
        const countryCode = geoData.country_code
        flag = emojiFlag(countryCode) + " "
      } catch (err) {
        flag = "  "
      }

      // parse address
      const targetAddress = req.body
      if (targetAddress.slice(0, 2) !== "0x") {
        targetAddress = "0x" + targetAddress
      }
      if (targetAddress.length !== 42) {
        return didError(
          res,
          new Error(`Address parse failure - "${targetAddress}"`)
        )
      }

      const alignedIpAddress = ipAddress.padStart(15, " ")
      const requestorMessage = `${flag} ${alignedIpAddress} requesting for ${targetAddress}`

      // check for greediness
      const balance = await getSafeTokenInWallet(targetAddress)
      const balanceTooFull = balance >= config.maxBalance

      if (balanceTooFull) {
        console.log(`[FAUCET] ${requestorMessage} - already has too much SAFE tokens`)
        return didError(
          res,
          new Error("[FAUCET] User is greedy - already has too much SAFE tokens")
        )
      }

      // send value
      refuelAccount(faucetAmountWei, targetAddress, (err, txHash) => {
        // this is an ugly workaround needed because web3 may throw an error after giving us a txHash
        if (res.finished) return

        if (err) {
          res.end(`${err}\n`)
        }
        if (txHash) {
          res.send(txHash)
        }
      })
    } catch (err) {
      console.error(err.stack)
      return didError(res, err)
    }
  }

  // Lazy nonce tracking fix:
  // Force an exit (docker will trigger a restart)
  setTimeout(() => {
    console.log("[SERVER] Restarting for better nonce tracking")
    shutdown()
  }, AUTO_RESTART_INTERVAL)

  // serve app
  app.get("/", (req, res) => deliverPage(req, res, pageCode))
  app.get("/index.html", (req, res) => deliverPage(req, res, pageCode))
  app.get("/app.js", (req, res) => deliverApp(req, res, appCode))

  // add IP-based rate limiting
  app.post("/", rateLimiter)
  // handle fauceting request
  app.post("/", handleRequest)

  // Do graceful shutdown
  const shutdown = () => {
    console.log("[SERVER] Gracefully shutting down...")
    server.close(() => {
      console.log("[SERVER] Shut down complete.")
      process.exit(0)
    })
  }

  // start server
  const server = app.listen(PORT, () => {
    console.log("[SERVER] Ethereum rpc listening on", PORT)
    console.log("and proxying to", config.rpcOrigin)
  })
}
