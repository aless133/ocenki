const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function testInterface(context) {
  const html = await fs.readFile(path.join(__dirname, '../public/index.html'), 'utf8');
  const css = await fs.readFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'), 'utf8');
  const report = {
    period: { from: '2026-09-01', to: '2026-10-20' }, collectedAt: '2026-10-20T08:00:00Z',
    subjects: [{ subject: 'Математика', events: [{ date: '2026-09-01', lesson: 1, label: '8', type: 'grade' }], sum: 8, count: 1, average: 8, absences: 0 }],
    totals: { sum: 8, count: 1, absences: 0 },
  };
  for (const saved of [true, false]) {
    const page = await context.newPage();
    let posts = 0;
    let statusReads = 0;
    await page.setRequestInterception(true);
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      let body;
      let status = 200;
      let contentType = 'application/json; charset=utf-8';
      if (pathname === '/child') { body = html; contentType = 'text/html; charset=utf-8'; }
      else if (pathname === '/assets/bootstrap.min.css') { body = css; contentType = 'text/css'; }
      else if (pathname === '/api/children') body = JSON.stringify([{ id: 'child', alias: 'Тест' }]);
      else if (pathname === '/child/report') { body = JSON.stringify(saved ? report : {}); status = saved ? 200 : 404; }
      else if (pathname.startsWith('/child/session')) {
        if (request.method() === 'POST') posts++;
        else statusReads++;
        body = JSON.stringify(request.method() === 'POST'
          ? { state: 'complete', message: 'Собрано', report }
          : { state: 'idle', message: 'Не запущено' });
      } else return request.abort();
      return request.respond({ status, contentType, body });
    });
    await page.goto('http://127.0.0.1:34567/child', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#report-rows tr');
    assert.equal(posts, saved ? 0 : 1);
    assert.equal(statusReads, saved ? 1 : 0);
    assert.equal(await page.$eval('#retry', element => element.textContent), 'Обновить данные');
    await page.click('#retry');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Собрано');
    assert.equal(posts, saved ? 1 : 2);
    await page.close();
  }
};
