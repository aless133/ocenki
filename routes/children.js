const express = require('express');
const path = require('node:path');
const { readChildren } = require('../children');
const { readReport } = require('../reports');

const router = express.Router({ mergeParams: true });

// Shared child lookup for /:childId and future nested routes.
router.use(async (request, response, next) => {
  const { childId } = request.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(childId)) return next('router');

  const children = await readChildren();
  const child = children.find((item) => item.id === childId);
  if (!child) return next('router');

  response.locals.child = child;
  next();
});

router.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/session', (request, response) => {
  response.json(request.app.locals.providerSessions.status(response.locals.child.id));
});

router.get('/report', async (request, response) => {
  const report = await readReport(response.locals.child.id);
  if (!report) return response.status(404).json({ error: 'Отчёт ещё не собран.' });
  response.json(report);
});

router.post('/session', async (request, response) => {
  response.json(await request.app.locals.providerSessions.start(response.locals.child));
});

router.post('/session/retry', async (request, response) => {
  response.json(await request.app.locals.providerSessions.retry(response.locals.child));
});

module.exports = router;
