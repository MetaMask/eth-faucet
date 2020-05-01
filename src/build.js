const fs = require('fs')
const path = require('path')
const Browserify = require('browserify')
const envify = require('envify/custom')
const { address } = require('./get-config')

const srcPath = path.join(__dirname, '/app.js')
const destPath = path.join(__dirname, '/../build/app.js')

// prepare app bundle
const browserify = Browserify()
// inject faucet address
browserify.transform(envify({
  FAUCET_ADDRESS: address
}))
browserify.add(srcPath)

// build app
browserify.bundle()
  .pipe(fs.createWriteStream(destPath))
