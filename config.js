module.exports = {
  scrapeInterval: 60000,
  trackInterval: 30000,
  maxTrackedTokens: 500,
  entryCriteria: {
    minMarketCap: 300,
    maxMarketCap: 3000,
    maxHolders: 50,
    minVolume: 50
  },
  tradeEndpoint: 'http://localhost:3000/trade'
};