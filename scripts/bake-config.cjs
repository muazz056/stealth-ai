// Build-time script: extracts BACKEND_URL from .env and writes config.json
// so the Electron main process (main.cjs) has the correct URL in packaged builds.
// Only the URL is written — secrets from .env are never bundled.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const url = process.env.VITE_BACKEND_URL || process.env.API_BACKEND_URL;
if (!url) {
  console.warn('⚠️ bake-config: VITE_BACKEND_URL / API_BACKEND_URL not set, skipping config.json');
  process.exit(0);
}

const configPath = path.join(__dirname, '..', 'config.json');
fs.writeFileSync(configPath, JSON.stringify({ BACKEND_URL: url }, null, 2));
console.log(`✅ bake-config: wrote ${url} to config.json`);
