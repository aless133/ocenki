const assert = require('node:assert/strict');
const { loginStudent } = require('../providers/e-schools');
const { createProviderSessions } = require('../providers');

(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  const context = await browser.createBrowserContext();
  try {
    for (const reject of [true, false]) {
      const page = await context.newPage();
      let selectedStudent = false;
      let submitted = false;
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        let body;
        if (url.hostname === 'diary.e-schools.by' && url.pathname === '/') {
          body = submitted && !reject ? '<h1>Test student dashboard</h1>' :
            '<a href="https://diary.e-schools.by/api/v1/admin/auth/login/student">Обучающийся</a><a href="/parent">Родитель обучающегося</a>';
        } else if (url.pathname === '/api/v1/admin/auth/login/student') {
          selectedStudent = true;
          return request.respond({ status: 302, headers: { location: 'https://oauth.rios.unibel.by/Account/Login' } });
        } else if (url.hostname === 'oauth.rios.unibel.by') {
          if (request.method() === 'POST') {
            assert.equal(selectedStudent, true);
            const fields = new URLSearchParams(request.postData());
            assert.equal(fields.get('Input.Username'), 'test-student');
            assert.equal(fields.get('Input.Password'), 'test-password');
            assert.equal(fields.has('Input.RememberLogin'), false);
            submitted = true;
            if (!reject) return request.respond({ status: 302, headers: { location: 'https://diary.e-schools.by/#/test-dashboard' } });
          }
          body = `${submitted ? '<div class="validation-summary-errors">Неверное имя пользователя или пароль</div>' : ''}
            <form action="/Account/Login" method="post">
            <label>Имя пользователя<input id="Input_Username" name="Input.Username"></label>
            <label>Пароль<input id="Input_Password" name="Input.Password" type="password"></label>
            <input id="Input_RememberLogin" type="checkbox" name="Input.RememberLogin" checked><button name="Input.Button">Вход</button></form>`;
        } else return request.abort();
        await request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      });
      const child = { server: 'https://diary.e-schools.by', login: 'test-student', password: 'test-password' };
      const progress = [];
      const attempt = loginStudent({ page, child, onProgress: state => progress.push(state) });
      if (reject) await assert.rejects(attempt, { code: 'INVALID_CREDENTIALS' });
      else assert.equal((await attempt).state, 'returned');
      assert.deepEqual(progress, ['opening', 'student', 'login']);
      assert.equal(submitted, true);
      assert.equal(page.isClosed(), false);
      await page.close();
    }
    await require('./diary.cjs')(context);
    await require('./interface.cjs')(context);
    let pageCount = 0;
    const sessions = createProviderSessions(() => ({ connected: true, newPage: async options => {
      assert.deepEqual(options, { type: 'tab', background: true });
      pageCount++;
      return { isClosed: () => false, createCDPSession: async () => ({ send: async () => {}, detach: async () => {} }), setDefaultTimeout: () => {}, setDefaultNavigationTimeout: () => {}, goto: async () => { throw new Error('net::ERR_TIMED_OUT secret'); } };
    } }));
    const child = { id: 'test', provider: 'e-schools', server: 'https://diary.e-schools.by', password: 'SECRET' };
    await Promise.all([sessions.start(child), sessions.start(child)]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pageCount, 1);
    assert.equal(sessions.status('test').code, 'NETWORK_ERROR');
    await sessions.start(child);
    assert.equal(pageCount, 1);
    await sessions.retry(child);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pageCount, 1);
    assert.equal(JSON.stringify(sessions.status('test')).includes('secret'), false);
    console.log('PASS: student login, week navigation and loading, date boundaries, multiple grades, absences, summary arithmetic, tab retention, deduplication, explicit retry and sanitized errors');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
