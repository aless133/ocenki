const { todayInMoscow, parseDiaryDate, summarizeLessons } = require('./grades');
const { waitForVisible, clickVisible } = require('./browser');

// Observed toolbar: today (calendar icon), previous week, next week.
// React IDs change after every click, so locate the buttons by their relationship.
const PREVIOUS = 'button:has(> svg > path[d^="M8 2V6"]) + button';
const NEXT = `${PREVIOUS} + button`;
const TABLES = 'table:has(th[id="subject"]):has(th[id="mark"])';

async function waitForWeek(page, previousDate = null) {
  await page.waitForFunction((selector, previous) => {
    const tables = [...document.querySelectorAll(selector)];
    if (tables.length !== 6) return false;
    const date = tables[0].querySelector('thead tr:first-child')?.innerText;
    if (!date || date === previous) return false;
    // Headers appear before the lesson request finishes. Wait for real cells even
    // on empty days; their empty placeholder rows are present in the loaded diary.
    return tables.every(table => table.querySelector('tbody td[id$="_subject"]')) &&
      ![...document.querySelectorAll('.MuiSkeleton-root,[role="progressbar"]')].some(e => e.getClientRects().length);
  }, { polling: 100, timeout: 45000 }, TABLES, previousDate);
}

async function readWeek(page) {
  const week = await page.evaluate((selector, previous, next) => ({
    days: [...document.querySelectorAll(selector)].map(table => ({
      heading: table.querySelector('thead tr:first-child').innerText.trim(),
      lessons: [...table.querySelectorAll('tbody tr')].flatMap((row, index) => {
        const subject = row.querySelector('td[id$="_subject"]')?.innerText.trim();
        if (!subject) return [];
        return [{
          subject: subject.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' '),
          lesson: Number(subject.match(/^(\d+)\./)?.[1] ?? index),
          time: row.querySelector('td[id$="_start"]')?.innerText.trim() ?? '',
          mark: row.querySelector('td[id$="_mark"]')?.innerText.trim() ?? '',
        }];
      }),
    })),
    previousDisabled: document.querySelector(previous)?.disabled,
    nextDisabled: document.querySelector(next)?.disabled,
    previousCount: document.querySelectorAll(previous).length,
    nextCount: document.querySelectorAll(next).length,
  }), TABLES, PREVIOUS, NEXT);
  if (week.previousCount !== 1 || week.nextCount !== 1) throw new Error('DIARY_FORMAT_CHANGED');
  for (const day of week.days) day.date = parseDiaryDate(day.heading);
  week.firstDate = week.days[0].date;
  return week;
}

async function changeWeek(page, week, direction) {
  await clickVisible(page, direction === 'previous' ? PREVIOUS : NEXT);
  await waitForWeek(page, week.days[0].heading);
  const next = await readWeek(page);
  const delta = (Date.parse(next.firstDate) - Date.parse(week.firstDate)) / 86400000;
  if (delta !== (direction === 'previous' ? -7 : 7)) throw new Error('DIARY_NAVIGATION_FAILED');
  return next;
}

async function collectDiary({ page, onProgress = () => {}, to = todayInMoscow(), from = null }) {
  await waitForVisible(page, 'a[href="#/diary"]');
  if (new URL(page.url()).hash !== '#/diary') await clickVisible(page, 'a[href="#/diary"]');
  onProgress('collecting', 'Ждите: ищем начало учебного года…');
  await waitForWeek(page);
  let week = await readWeek(page);
  let moves = 0;
  while (!week.previousDisabled && (!from || week.firstDate > from)) {
    // A changed provider must fail explicitly rather than show a partial report.
    if (++moves > 60) throw new Error('DIARY_NAVIGATION_FAILED');
    week = await changeWeek(page, week, 'previous');
  }
  const firstDate = from ?? week.firstDate;
  const lessons = [];
  let weeks = 0;
  while (week.firstDate <= to) {
    if (++weeks > 60) throw new Error('DIARY_NAVIGATION_FAILED');
    onProgress('collecting', `Ждите: собираем неделю с ${week.days[0].heading.match(/\d{2}\.\d{2}\.\d{4}/)[0]}…`);
    for (const day of week.days) {
      for (const lesson of day.lessons) lessons.push({ date: day.date, ...lesson });
    }
    const nextMonday = new Date(Date.parse(week.firstDate) + 7 * 86400000).toISOString().slice(0, 10);
    if (nextMonday > to || week.nextDisabled) break;
    week = await changeWeek(page, week, 'next');
  }
  return {
    ...summarizeLessons(lessons, { from: firstDate, to }),
    weeks, collectedAt: new Date().toISOString(),
  };
}

module.exports = { collectDiary, readWeek, waitForWeek };
