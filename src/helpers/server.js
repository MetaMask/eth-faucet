const didError = (res, err) => res.status(500).json({ error: err.message })

const invalidRequest = res =>
  res.status(400).json({ error: "Not a valid request." })

const deliverPage = (req, res, pageCode) => res.status(200).send(pageCode)

const deliverApp = (req, res, appCode) => res.status(200).send(appCode)

module.exports = {
  didError,
  invalidRequest,
  deliverApp,
  deliverPage
}
