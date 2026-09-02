import puppeteer from 'puppeteer';

(async () => {
  console.log('Lanzando navegador...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    } else {
      console.log('PAGE LOG:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE UNCAUGHT ERROR:', err.message);
  });
  
  page.on('requestfailed', request => {
    console.log('PAGE REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  console.log('Navegando a http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    console.log('Página cargada.');
  } catch(e) {
    console.error('Error navegando:', e.message);
  }
  
  await browser.close();
  console.log('Terminado.');
})();
