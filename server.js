const http = require('node:http');
const express = require('express');
const path = require('node:path');
const { once } = require('node:events');
const { initializeStorage, listChildren } = require('./children');
const childRoutes = require('./routes/children');
const { createProviderSessions } = require('./providers');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

const app = express();
let browser;
app.locals.providerSessions = createProviderSessions(() => browser);
app.disable('x-powered-by');
app.set('case sensitive routing', true);

app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).type('text').send('Метод не поддерживается.');
    return;
  }
  if (request.method === 'POST' && request.get('origin') !== `http://${host}:${port}`) {
    response.status(403).json({ error: 'Запускайте вход из локального приложения.' });
    return;
  }
  next();
});

app.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/assets/bootstrap.min.css', (request, response) => {
  response.sendFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'));
});

app.get('/api/children', async (request, response) => {
  response.json(await listChildren());
});

app.use('/:childId', childRoutes);

app.use((request, response) => {
  response.status(404).type('text').send('Страница не найдена.');
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  // Do not expose file contents or credentials to the browser.
  const status = error.status === 400 ? 400 : 500;
  response.status(status).json({
    error: status === 400
      ? 'Некорректный адрес запроса.'
      : 'Не удалось загрузить данные. Проверьте файлы .env в private/children/.',
  });
});

const server = http.createServer(app);

async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('INVALID_PORT');
  }
  await initializeStorage();
  server.listen(port, host);
  await once(server, 'listening');
  const url = `http://${host}:${port}`;
  console.log(`Локальный сервер: ${url}`);

  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized'],
    });
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

module.exports = { app, server, start };
