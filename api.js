require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { logEvent } = require('./logger');
const { startScraping } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const watchlistPath = path.join(__dirname, 'watchlist.json');
const logDir = path.resolve(__dirname, 'logs');

let watchlist = {};

// ✅ Load tokens once at startup
function loadTokens() {
  try {
    watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to load watchlist:', err.message);
    watchlist = {};
  }
}

// Initial load
loadTokens();

// ✅ Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cookieParser());

// ✅ Static assets and body parsing
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const password = process.env.AUTH_PASSWORD;

  // Allow browser access via simple cookie check
  if (req.cookies?.auth === password) {
    return next();
  }

  // Allow API access via Authorization header (Bearer or plain text)
  if (authHeader === password || authHeader === `Bearer ${password}`) {
    return next();
  }

  // If not authorized, return 401 for API or show login page for browser
  if (req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Browser: show login form
  res.send(`
    <form method="POST" action="/login" style="padding: 2rem">
      <h2>🔐 Enter Password</h2>
      <input type="password" name="password" placeholder="Password" style="padding: .5rem" />
      <button type="submit" style="padding: .5rem">Login</button>
    </form>
  `);
}

// ✅ Watchlist route for EJS page
app.get('/tokens', (req, res) => {
  let watchlist = {};
  try {
    const raw = fs.readFileSync(watchlistPath, 'utf-8');
    watchlist = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to load watchlist for /tokens:', err.message);
    return res.status(500).json({ error: 'Failed to load token data' });
  }

  const sortedTokens = Object.values(watchlist)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100); // limit to latest 100

  res.json(sortedTokens);
});

app.get('/watchlist', (req, res) => {
  let watchlist = {};
  try {
    const raw = fs.readFileSync(watchlistPath, 'utf-8');
    watchlist = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to load watchlist:', err.message);
  }

  // Sort by createdAt descending
  const sortedTokens = Object.values(watchlist).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.render('watchlist', { tokens: sortedTokens });
});

app.get('/logs', requireAuth, (req, res) => {
  fs.readdir(logDir, (err, files) => {
    if (err) {
      return res.status(500).send('Failed to read log directory.');
    }

    const logs = files
      .filter(file => file.endsWith('.log'))
      .map(file => ({
        name: file,
        viewPath: `/logs/view/${file}`,
        downloadPath: `/logs/download/${file}`,
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first

    res.render('logs', {
      logs,
      currentLogPath: '/logs/view/system.log',
    });
  });
});

app.get('/logs/view/:filename', requireAuth, (req, res) => {
  const filePath = path.join(logDir, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Log file not found.');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.render('log-view', {
    title: req.params.filename,
    content,
  });
});

app.get('/logs/download/:filename', requireAuth, (req, res) => {
  const filePath = path.join(logDir, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Log file not found.');
  }

  res.download(filePath);
});

// ✅ Simple health check
app.get('/', (req, res) => {
  res.send('✅ Sniper server is running');
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.AUTH_PASSWORD) {
    res.cookie('auth', password, { httpOnly: true });
    return res.redirect(req.headers.referer || '/');
  }
  res.send('<p>❌ Incorrect password</p>');
});

async function runScraperLoop() {
  while (true) {
    try {
      logEvent('CORE', '🔁 Starting new scraping cycle...');
      await startScraping(); // this should perform 1 scrape and return

      logEvent('CORE', '✅ Scraping complete. Sleeping for 60 seconds...');
      await new Promise(resolve => setTimeout(resolve, 60_000));
    } catch (err) {
      logEvent('CORE', `❌ Scraper loop error: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 30_000)); // shorter delay on error
    }
  }
}

// ✅ Start the loop
logEvent('CORE', '🚀 Starting scraper loop...');
runScraperLoop();

app.listen(PORT, () => {
  console.log(`🚀 Sniper server running at http://localhost:${PORT}`);
});