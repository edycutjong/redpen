const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const assets = [
  { file: 'generate-og-image.html', width: 1200, height: 630, output: 'og-image.png' },
  { file: 'generate-youtube-thumbnail.html', width: 1280, height: 720, output: 'youtube-thumbnail.png' },
  { file: 'generate-devpost-thumbnail.html', width: 1200, height: 800, output: 'devpost-thumbnail.png' },
  { file: 'generate-devpost-gallery.html', width: 1200, height: 800, output: 'devpost-gallery.png' },
  { file: 'generate-readme-hero.html', width: 1280, height: 640, output: 'readme-hero.png' },
];

(async () => {
  console.log('Starting asset export pipeline...');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();

    // 1. Process HTML Assets
    for (const asset of assets) {
      const startTime = Date.now();
      const fileUrl = 'file://' + path.resolve(__dirname, asset.file);
      
      await page.setViewportSize({ width: asset.width, height: asset.height });
      await page.goto(fileUrl);
      
      // Wait for fonts to load
      await page.evaluate(() => document.fonts.ready);
      
      const outputPath = path.resolve(__dirname, asset.output);
      await page.screenshot({
        path: outputPath,
        fullPage: false,
        animations: 'disabled', // Freezes animations at their final/visible state
      });
      
      const duration = Date.now() - startTime;
      console.log(`✓ ${asset.output} (${duration}ms)`);
    }

    // 2. Process SVG Icon Rasterization (transparency preserved)
    const svgPath = path.resolve(__dirname, '../../public/icon.svg');
    if (fs.existsSync(svgPath)) {
      const svg = fs.readFileSync(svgPath, 'utf-8');
      for (const size of [512, 1024]) {
        const startTime = Date.now();
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
        
        await page.evaluate(() => document.fonts.ready);
        
        const outputName = `icon-${size}.png`;
        const outputPath = path.resolve(__dirname, outputName);
        
        await page.screenshot({
          path: outputPath,
          omitBackground: true,
          animations: 'disabled',
        });
        
        const duration = Date.now() - startTime;
        console.log(`✓ ${outputName} (${duration}ms)`);
      }
    } else {
      console.warn('⚠️ icon.svg not found, skipping icon rasterization.');
    }
    
    console.log('Asset export pipeline completed successfully!');
  } catch (error) {
    console.error('❌ Error during asset export:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
