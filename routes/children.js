const express = require('express');
const path = require('node:path');
const { listChildren } = require('../children');

const router = express.Router({ mergeParams: true });

// Shared child lookup for /:childId and future nested routes.
router.use(async (request, response, next) => {
  const { childId } = request.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(childId)) return next('router');

  const children = await listChildren();
  const child = children.find((item) => item.id === childId);
  if (!child) return next('router');

  response.locals.child = child;
  next();
});

router.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = router;
