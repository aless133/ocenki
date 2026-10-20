const { loginStudent, resetStudentSession } = require('./e-schools');
const { collectDiary } = require('./e-schools-diary');
const { saveReport } = require('../reports');

const providers = new Map([['e-schools', async context => {
  await loginStudent(context);
  const report = await collectDiary(context);
  await saveReport(context.child.id, report);
  return { state: 'complete', message: 'Отметки и пропуски собраны. Вкладка дневника остаётся открытой.', report };
}]]);
const messages = {
  INVALID_CREDENTIALS: 'Неверное имя пользователя или пароль. Проверьте LOGIN и PASSWORD ученика в локальном файле и нажмите «Повторить вход».',
  INVALID_PROVIDER_SERVER: 'Для провайдера e-schools укажите SERVER=https://diary.e-schools.by.',
  UNEXPECTED_LOGIN_PAGE: 'Сайт открыл неожиданную страницу входа. Проверьте открытую вкладку провайдера.',
  LOGIN_REJECTED: 'Сайт отклонил вход. Проверьте сообщение во вкладке провайдера.',
  UNSUPPORTED_PROVIDER: 'Обработчик этого провайдера пока не подключён.',
  BROWSER_UNAVAILABLE: 'Браузер Puppeteer недоступен. Перезапустите локальный сервер.',
  DIARY_FORMAT_CHANGED: 'Структура таблицы дневника изменилась. Не удалось собрать полный отчёт.',
  DIARY_NAVIGATION_FAILED: 'Не удалось последовательно пролистать дневник. Полный отчёт не сформирован.',
};

function createProviderSessions(getBrowser) {
  const sessions = new Map();
  let queue = Promise.resolve();
  let activeAccount;

  function enqueue(session, child) {
    session.public = { state: 'queued', message: 'Ждите: готовим сбор данных ученика…' };
    queue = queue.then(() => run(session, child));
  }

  function status(childId) {
    return sessions.get(childId)?.public ?? { state: 'idle', message: 'Вход ещё не запущен.' };
  }

  async function start(child) {
    const existing = sessions.get(child.id);
    // Coalesce double clicks and browser refreshes, including rejected credentials.
    // Retrying requires an explicit request, so a refresh cannot lock an account.
    if (existing) {
      return status(child.id);
    }
    const session = { public: { state: 'opening', message: 'Ждите: открываем сайт ученика…' } };
    sessions.set(child.id, session);
    enqueue(session, child);
    return session.public;
  }

  async function run(session, child) {
    let interaction;
    try {
      const collect = providers.get(child.provider);
      if (!collect) throw new Error('UNSUPPORTED_PROVIDER');
      const browser = getBrowser();
      if (!browser?.connected) throw new Error('BROWSER_UNAVAILABLE');
      const account = JSON.stringify([child.provider, child.server, child.login]);
      if (!session.page || session.page.isClosed() || session.account !== account) {
        session.page = await browser.newPage({ type: 'tab', background: true });
        session.account = account;
      }
      if (activeAccount !== account) {
        activeAccount = undefined;
        await resetStudentSession(session.page);
        activeAccount = account;
      }
      // Give CDP mouse input a live render surface without selecting the tab.
      // Chrome otherwise suspends frame/viewport observers in background tabs.
      interaction = await session.page.createCDPSession();
      await interaction.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      session.public = await collect({
        page: session.page,
        child,
        onProgress: (state, message) => { session.public = { state, message }; },
      });
    } catch (error) {
      activeAccount = undefined;
      const code = messages[error.code ?? error.message] ? (error.code ?? error.message)
        : error.name === 'TimeoutError' || error.message?.startsWith('net::') ? 'NETWORK_ERROR' : 'PROVIDER_ERROR';
      session.public = {
        state: 'error', code,
        message: messages[code] ?? (code === 'NETWORK_ERROR'
          ? 'Не удалось дождаться ответа сайта. Проверьте открытую вкладку и повторите вход.'
          : 'Не удалось выполнить вход. Проверьте открытую вкладку провайдера.'),
      };
      // Never log raw browser errors: URLs may contain OAuth codes and form data.
    } finally {
      if (interaction) {
        await interaction.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
        await interaction.detach().catch(() => {});
      }
    }
    // Keep the provider tab open on both success and failure.
  }

  async function retry(child) {
    const session = sessions.get(child.id);
    if (session && !['error', 'complete'].includes(session.public.state)) return start(child);
    // Reuse the error tab and re-read credentials through the route on every retry.
    sessions.delete(child.id);
    if (!session?.page || session.page.isClosed()) return start(child);
    session.public = { state: 'opening', message: 'Ждите: повторяем вход ученика…' };
    sessions.set(child.id, session);
    enqueue(session, child);
    return session.public;
  }

  return { status, start, retry };
}

module.exports = { createProviderSessions };
