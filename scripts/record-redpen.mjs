import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Starting automated RedPen interaction recording script...');
  
  // Start a local HTTP server to host the static bundle files, avoiding CORS blocks on ES modules
  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0].split('#')[0];
    if (reqUrl === '/' || reqUrl === '/index.html') {
      reqUrl = '/bundle/index.html';
    }
    
    let filePath = path.join(__dirname, '..', reqUrl);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, '../bundle', reqUrl);
    }
    if (!fs.existsSync(filePath) && reqUrl.includes('/public/')) {
      filePath = path.join(__dirname, '..', reqUrl.substring(reqUrl.indexOf('/public/')));
    }

    let contentType = 'text/html';
    if (filePath.endsWith('.js')) contentType = 'application/javascript';
    else if (filePath.endsWith('.css')) contentType = 'text/css';
    else if (filePath.endsWith('.png')) contentType = 'image/png';
    else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (filePath.endsWith('.json')) contentType = 'application/json';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  let port = 8000;
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`Local static server started at http://localhost:${port}`);
      resolve();
    });
  });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--window-size=1460,1000', '--no-sandbox']
  });

  let recorder;
  try {
    const page = await browser.newPage();
    page.on('dialog', async dialog => {
      console.log(`[Puppeteer] Auto-accepting dialog: [${dialog.type()}] "${dialog.message()}"`);
      await dialog.accept();
    });

    recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: false, fps: 30,
      videoFrame: { width: 1440, height: 900 },
      videoCrf: 18, videoCodec: 'libx264', videoPreset: 'ultrafast', videoBitrate: 3000,
      autopad: { color: 'black' },
    });
    const videoPath = path.join(__dirname, '..', 'redpen_demo.mp4');
    console.log(`🎥 Recording to: ${videoPath}`);
    await recorder.start(videoPath);
    const appUrl = `http://localhost:${port}/bundle/index.html`;
    
    console.log(`Navigating to ${appUrl}...`);
    await page.goto(appUrl);
    await page.waitForSelector('#contract-textarea');
    await delay(1000);
    
    // Step 1: Click "Load Sample Agreement"
    console.log('Step 1: Loading sample agreement...');
    await page.click('#load-sample-link');
    await delay(1500);
    
    // Step 2: Click "Analyze Agreement"
    console.log('Step 2: Triggering audit analysis...');
    await page.click('#analyze-btn');
    await delay(1000);
    
    // Step 3: Handle x402 payment challenges
    console.log('Step 3: Simulating x402 payment challenges...');
    for (let i = 0; i < 15; i++) {
      try {
        await page.waitForSelector('#x402-payment-backdrop', { visible: true, timeout: 3000 });
        console.log(`  Approving payment challenge #${i + 1}...`);
        await page.click('#x402-pay-btn');
        await delay(1000);
      } catch (e) {
        // Modal might not be visible yet or completed
        break;
      }
    }
    
    // Step 4: Wait for Review Desk to load
    console.log('Step 4: Waiting for Review Desk view...');
    await page.waitForSelector('#screen-review', { visible: true, timeout: 20000 });
    await delay(2000);
    
    // Step 5: Walk through review cards
    console.log('Step 5: Reviewing clauses...');
    for (let step = 0; step < 10; step++) {
      console.log(`  Reviewing Clause #${step + 1}...`);
      
      const riskText = await page.$eval('#active-risk-badge', el => el.textContent);
      if (riskText === 'CRITICAL' || riskText === 'HIGH') {
        console.log(`    High risk detected (${riskText}). Accepting AI alternative.`);
        await page.click('#accept-alt-btn');
      } else {
        console.log(`    Low/medium risk detected. Keeping original.`);
        await page.click('#keep-original-btn');
      }
      await delay(1500);
    }
    
    // Step 6: Verify Export View
    console.log('Step 6: Finalizing redlines and verifying Export screen...');
    await page.waitForSelector('#screen-export', { visible: true, timeout: 10000 });
    await delay(2000);
    
    // Click Upload to R2
    console.log('Step 7: Uploading to Host R2 Persistent Storage...');
    await page.click('#upload-r2-btn');
    await delay(2000);
    
    console.log('All recording automation finished successfully!');
  } catch (error) {
    console.error('❌ Automation failed:', error);
  } finally {
    if (recorder) {
      console.log('🛑 Stopping recording...');
      await recorder.stop();
    }
    await browser.close();
    server.close();
  }
})();
