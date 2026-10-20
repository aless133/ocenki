function todayInMoscow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseDiaryDate(text) {
  const match = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!match) throw new Error('DIARY_FORMAT_CHANGED');
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('DIARY_FORMAT_CHANGED');
  return iso;
}

function parseMarks(text) {
  const tokens = text.trim().split(/[\s,;/]+/u).filter(token => token && !['—', '-'].includes(token));
  return tokens.map(token => {
    if (/^(10|[1-9])$/.test(token)) return { type: 'grade', value: Number(token), label: token };
    if (/^н$/iu.test(token)) return { type: 'absence', label: 'Н' };
    return { type: 'other', label: token };
  });
}

function summarizeLessons(lessons, { from, to }) {
  const subjects = new Map();
  const seen = new Set();
  let ignoredFuture = 0;
  for (const lesson of [...lessons].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.lesson - b.lesson)) {
    if (lesson.date > to) { ignoredFuture++; continue; }
    if (lesson.date < from) continue;
    const key = JSON.stringify([lesson.date, lesson.lesson, lesson.time, lesson.subject]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!subjects.has(lesson.subject)) subjects.set(lesson.subject, {
      subject: lesson.subject, events: [], sum: 0, count: 0, average: null, absences: 0,
    });
    const row = subjects.get(lesson.subject);
    const tokens = parseMarks(lesson.mark);
    let absent = false;
    for (const token of tokens) {
      row.events.push({ date: lesson.date, lesson: lesson.lesson, time: lesson.time, ...token });
      if (token.type === 'grade') { row.sum += token.value; row.count++; }
      if (token.type === 'absence') absent = true;
    }
    if (absent) row.absences++;
  }
  const rows = [...subjects.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'ru'));
  for (const row of rows) row.average = row.count ? row.sum / row.count : null;
  const totals = rows.reduce((total, row) => ({
    sum: total.sum + row.sum, count: total.count + row.count, absences: total.absences + row.absences,
  }), { sum: 0, count: 0, absences: 0 });
  return { period: { from, to }, subjects: rows, totals, ignoredFuture };
}

module.exports = { todayInMoscow, parseDiaryDate, parseMarks, summarizeLessons };
