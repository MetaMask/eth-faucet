const fs = require('fs')
const path = require('path')
const browserify = require('browserify')
const lavamoat = require('lavamoat-browserify')
const envify = require('envify/custom')
const { address } = require('../server/get-config')

const srcDir = path.join(__dirname, '..', 'webapp')
const htmlPath = path.join(srcDir, 'index.html')
const entryPath = path.join(srcDir, 'index.js')
const buildDir = path.join(__dirname, '..', '..', 'build', )
const destPath = path.join(buildDir, 'app.js')

// prepare app bundle
const bundler = browserify(lavamoat.args)

// inject faucet address
bundler.transform(envify({
  FAUCET_ADDRESS: address
}))

// add lavamoat protections
const policyDir = path.join(srcDir, 'lavamoat', 'browserify')
bundler.plugin(lavamoat, {
  policy: path.join(policyDir, 'policy.json'),
  policyOverride: path.join(policyDir, 'policy-override.json'),
})

// add app entry
bundler.add(entryPath)

// ensure dest dir exists
fs.mkdirSync(buildDir, { recursive: true })

// copy html file over
fs.copyFileSync(htmlPath, path.join(buildDir, 'index.html'))

// build app
bundler.bundle()
  .pipe(fs.createWriteStream(destPath))
