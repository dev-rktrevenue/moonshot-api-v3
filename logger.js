const fs = require('fs');
const path = require('path');

const logDir = path.resolve(__dirname, 'logs');
const systemLogFile = path.join(logDir, 'system.log');

// Ensure logs/ directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function logEvent(tag, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${tag}] ${message}\n`;

  fs.appendFile(systemLogFile, logLine, err => {
    if (err) console.error(`❌ Failed to write system.log: ${err.message}`);
  });

  // Also save to daily log
  const date = timestamp.slice(0, 10); // "YYYY-MM-DD"
  const dailyLogFile = path.join(logDir, `system-${date}.log`);
  fs.appendFile(dailyLogFile, logLine, err => {
    if (err) console.error(`❌ Failed to write daily log: ${err.message}`);
  });
}

module.exports = { logEvent };