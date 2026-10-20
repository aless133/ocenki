const DIARY_ORIGIN = 'https://diary.e-schools.by';
const AUTH_ORIGIN = 'https://oauth.rios.unibel.by';
const STUDENT_LINK = `a[href="${DIARY_ORIGIN}/api/v1/admin/auth/login/student"]`;

class ProviderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Only the student path has been inspected. Parent authorization is separate.
async function loginStudent({ page, child, onProgress }) {
  if (new URL(child.server).origin !== DIARY_ORIGIN) {
    throw new ProviderError('INVALID_PROVIDER_SERVER');
  }
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  onProgress('opening', 'Ждите: открываем электронную школу…');
  await page.goto(child.server, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(STUDENT_LINK, { visible: true });
  onProgress('student', 'Ждите: выбираем вход «Обучающийся»…');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator(STUDENT_LINK).click(),
  ]);
  const authUrl = new URL(page.url());
  if (authUrl.origin !== AUTH_ORIGIN || authUrl.pathname.toLowerCase() !== '/account/login') {
    throw new ProviderError('UNEXPECTED_LOGIN_PAGE');
  }

  onProgress('login', 'Ждите: входим под учётной записью ученика…');
  for (const [selector, value] of [
    ['#Input_Username', child.login],
    ['#Input_Password', child.password],
  ]) {
    await page.waitForSelector(selector, { visible: true });
    await page.locator(selector).click();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type(selector, value);
  }
  const remember = '#Input_RememberLogin';
  await page.waitForSelector(remember, { visible: true });
  if (await page.$eval(remember, element => element.checked)) await page.locator(remember).click();

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('button[name="Input.Button"]').click(),
  ]);
  // Inspect the rendered response; do not call the authentication API directly.
  await page.waitForFunction((diaryOrigin) => {
    const visible = element => element.getClientRects().length > 0;
    const errors = [...document.querySelectorAll('.validation-summary-errors,.field-validation-error,[role="alert"]')];
    return errors.some(element => visible(element) && element.textContent.trim()) ||
      (location.origin === diaryOrigin && !location.hash.startsWith('#/login') && document.body.innerText.trim());
  }, {}, DIARY_ORIGIN);

  if (new URL(page.url()).origin === AUTH_ORIGIN) {
    const invalid = await page.evaluate(() => [...document.querySelectorAll('.validation-summary-errors,.field-validation-error,[role="alert"]')]
      .some(element => element.getClientRects().length && element.textContent.includes('Неверное имя пользователя или пароль')));
    throw new ProviderError(invalid ? 'INVALID_CREDENTIALS' : 'LOGIN_REJECTED');
  }
  if (new URL(page.url()).origin !== DIARY_ORIGIN) {
    throw new ProviderError('UNEXPECTED_LOGIN_PAGE');
  }
  return {
    state: 'returned',
    message: 'Сайт завершил перенаправление после входа. Вкладка открыта; получение оценок ещё не подключено.',
  };
}

module.exports = { loginStudent, ProviderError };
