const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const { initializeStorage, listChildren } = require('./children');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  function send(status, type, body) {
    response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
    response.end(body);
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    send(405, 'text/plain', 'Метод не поддерживается.');
    return;
  }

  const pathname = request.url.split('?')[0];
  try {
    if (pathname === '/') {
      const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
      send(200, 'text/html', html);
    } else if (pathname === '/api/children') {
      send(200, 'application/json', JSON.stringify(await listChildren()));
    } else if (/^\/[a-zA-Z0-9_-]+$/.test(pathname)
      && (await listChildren()).some((child) => `/${child.id}` === pathname)) {
      const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
      send(200, 'text/html', html);
    } else {
      send(404, 'text/plain', 'Страница не найдена.');
    }
  } catch {
    // Do not expose file contents or credentials to the browser.
    send(500, 'application/json', JSON.stringify({ error: 'Не удалось загрузить данные. Проверьте файлы .env в private/children/.' }));
  }
});

async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('INVALID_PORT');
  }
  await initializeStorage();
  server.listen(port, host);
  await once(server, 'listening');
  const url = `http://${host}:${port}`;
  console.log(`Локальный сервер: ${url}`);

  let browser;
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: false });
    const [page] = await browser.pages();
    await (page ?? await browser.newPage()).goto(url, { waitUntil: 'networkidle0' });
  } catch {
    if (browser) await browser.close().catch(() => {});
    browser = undefined;
    console.error(`Не удалось открыть браузер Puppeteer. Откройте ${url} вручную. Если Chrome не установлен, выполните npx puppeteer browsers install.`);
  }
  return { server, browser };
}

if (require.main === module) {
  let browser;
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    if (browser) await browser.close().catch(() => {});
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { void stop(); });
  }
  start().then(async (result) => {
    browser = result.browser;
    // A stop signal may arrive while Chrome is starting.
    if (stopping && browser) await browser.close().catch(() => {});
  }).catch((error) => {
    console.error(error.message === 'INVALID_PORT'
      ? 'Укажите PORT в .env: целое число от 1 до 65535.'
      : error.code === 'EADDRINUSE'
        ? `Порт ${port} уже занят.`
        : 'Не удалось запустить локальный сервер.');
    process.exitCode = 1;
  });
}

module.exports = { server, start };
