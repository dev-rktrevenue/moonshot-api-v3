//Scraper
const puppeteer = require('puppeteer');
const fs = require('fs');
const config = require('./config');
const { logEvent } = require('./logger');
let watchlist = require('./watchlist.json');

const MAX_TRACKED_TOKENS = config.maxTrackedTokens || 100;

async function startScraping() {
  logEvent('SCRAPER', '🚀 Scraper loop started');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    userDataDir: null
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://pump.fun/advanced/coin?scan=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    logEvent('SCRAPER', `✅ Loaded Pump.fun Advanced page`);
  } catch (err) {
    logEvent('SCRAPER', `❌ Failed to load Pump.fun page: ${err.message}`);
    await browser.close();
    return;
  }

  while (true) {
    try {
      logEvent('SCRAPER', '🔄 Beginning scrape cycle...');
      const tokens = await page.evaluate(() => {
        const tokenEls = document.querySelectorAll('[data-coin-mint]');
        const data = [];

        tokenEls.forEach(el => {
          const rawMint = el.getAttribute('data-coin-mint') ?? '';
          const mint = rawMint.replace('-latest', '').replace('-featured', '');
          const name = el.querySelector('.font-bold')?.innerText.trim() ?? '';
          const desc = el.querySelector('.font-semibold')?.innerText.trim() ?? '';
          const age = Array.from(el.querySelectorAll('span')).find(s => s.classList.contains('text-[11px]'))?.innerText ?? '';

          const volumeDiv = Array.from(el.querySelectorAll('div')).find(div => div.textContent.includes('Vol:'));
          const mcDiv = Array.from(el.querySelectorAll('div')).find(div => div.textContent.includes('MC:'));
          const volume = volumeDiv?.innerText.match(/\$([0-9,.K]+)/)?.[1] ?? '0';
          const marketCap = mcDiv?.innerText.match(/\$([0-9,.K]+)/)?.[1] ?? '0';

          const personIcon = el.querySelector('img[src*="person.svg"]');
          const holdersText = personIcon?.parentElement?.nextElementSibling?.innerText ?? '0';

          function parseNumber(str) {
            if (!str) return 0;
            const cleaned = str.replace(/[^0-9.]/g, '');
            if (str.includes('K')) return parseFloat(cleaned) * 1000;
            return parseFloat(cleaned);
          }

          data.push({
            mint,
            name,
            description: desc,
            age,
            volume: parseNumber(volume),
            marketCap: parseNumber(marketCap),
            holders: parseInt(holdersText)
          });
        });

        return data;
      });

      logEvent('SCRAPER', `🧪 Scraped ${tokens.length} tokens`);

      let added = 0;
      const currentCount = Object.keys(watchlist).length;

      for (const token of tokens) {
        if (currentCount + added >= MAX_TRACKED_TOKENS) {
          logEvent('SCRAPER', `⛔ Reached max tracked token limit (${MAX_TRACKED_TOKENS}). Skipping further additions.`);
          break;
        }

        if (!watchlist[token.mint]) {
          logEvent('SCRAPER', `🆕 Tracking new token: ${token.name} | MC: $${token.marketCap} | Vol: $${token.volume}`);
          const mintKey = token.mint.replace('-featured', '');
          watchlist[mintKey] = {
            name: token.name,
            address: mintKey,
            description: token.description,
            marketCap: token.marketCap,
            volume: token.volume,
            holders: token.holders,
            ageText: token.age,
            createdAt: new Date().toISOString(),
            initialPrice: token.marketCap / 1_000_000_000,
            entryTime: new Date().toISOString(),
            history: []
          };
          added++;
          saveWatchlist();
        }
      }

      logEvent('SCRAPER', `✅ Scrape complete. Sleeping for 60 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 60_000)); // sleep for 1 minute
    } catch (err) {
      logEvent('SCRAPER', `❌ Error in scraper loop: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 30_000)); // short sleep on failure
    }
  }
}

function saveWatchlist() {
  const maxTokens = 300;

  // Convert to array for sorting and trimming
  let tokensArray = Object.entries(watchlist).map(([mint, data]) => ({
    mint,
    ...data
  }));

  // Sort by createdAt (oldest first)
  tokensArray.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Trim to the newest `maxTokens`
  tokensArray = tokensArray.slice(-maxTokens);

  // Rebuild watchlist object
  watchlist = {};
  for (const token of tokensArray) {
    watchlist[token.mint] = token;
  }

  // Save to file
  fs.writeFileSync('./watchlist.json', JSON.stringify(watchlist, null, 2));
}

module.exports = { startScraping };