//Tracker
const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const { logEvent } = require('./logger');
const { getPumpFunData, closeBrowser } = require('./puppeteerWrapper');
const { saveHistoricalSnapshot } = require('./historyLogger');

async function startTrackingOnce() {
  const watchlist = JSON.parse(fs.readFileSync('./watchlist.json', 'utf-8'));
  logEvent('TRACKER', '✅ Tracker started');

    for (const [address, token] of Object.entries(watchlist)) {
    try {
      const data = await getPumpFunData(address);

      if (!data || typeof data.price !== 'number') {
        logEvent('TRACKER', `⚠️ Skipping ${address} - invalid price`);
        continue;
      }

      token.history.push({
        price: data.price,
        time: new Date().toISOString()
      });

      if (typeof token.initialPrice !== 'number') {
        token.initialPrice = data.price;
      }

      const gain = ((data.price - token.initialPrice) / token.initialPrice) * 100;

      if (gain >= 100) {
        logEvent('TRACKER', `🚀 ${token.name} gained ${gain.toFixed(2)}%`);
        await sendToTrade(token, data.price);
        delete watchlist[address];
      }

      saveHistoricalSnapshot(token);

    } catch (err) {
      logEvent('TRACKER', `❌ Error tracking ${address}: ${err.message}`);
    }

  fs.writeFileSync('./watchlist.json', JSON.stringify(watchlist, null, 2));
  logEvent('TRACKER', '💾 Watchlist saved');
}
}

async function sendToTrade(token, currentPrice) {
  try {
    await axios.post(config.tradeEndpoint, {
      ...token,
      currentPrice
    });
    console.log(`✅ Trade posted for ${token.name}`);
  } catch (e) {
    console.error(`❌ Trade post failed: ${e.message}`);
  }
}

function saveWatchlist() {
  try {
    console.log('💾 Saving watchlist with updated history...');
    console.log(`💾 Saving watchlist: ${Object.keys(watchlist).length} tokens`);
    fs.writeFileSync('./watchlist.json', JSON.stringify(watchlist, null, 2));
    logEvent('TRACKER', '💾 Watchlist saved successfully');
  } catch (err) {
    logEvent('TRACKER', `❌ Failed to save watchlist: ${err.message}`);
  }
}

// Gracefully shut down Puppeteer when app is interrupted
process.on('SIGINT', async () => {
  logEvent('TRACKER', '🛑 SIGINT received, closing browser and exiting...');
  await closeBrowser();
  process.exit();
});

process.on('SIGTERM', async () => {
  logEvent('TRACKER', '🛑 SIGTERM received, closing browser and exiting...');
  await closeBrowser();
  process.exit();
});

module.exports = { startTrackingOnce };