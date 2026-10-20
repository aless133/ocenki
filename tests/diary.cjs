const assert = require('node:assert/strict');
const { collectDiary } = require('../providers/e-schools-diary');
const { parseMarks, summarizeLessons, todayInMoscow } = require('../providers/grades');

module.exports = async function testDiary(context) {
  assert.equal(todayInMoscow(new Date('2026-10-19T21:01:00Z')), '2026-10-20');
  assert.deepEqual(parseMarks('10, 8 / 8; н'), [
    { type: 'grade', value: 10, label: '10' },
    { type: 'grade', value: 8, label: '8' },
    { type: 'grade', value: 8, label: '8' },
    { type: 'absence', label: 'Н' },
  ]);
  const lesson = { date: '2026-09-01', lesson: 1, time: '09:00', subject: 'Математика', mark: '8,8' };
  const summary = summarizeLessons([lesson, lesson, { ...lesson, date: '2026-09-03', mark: '10' }], { from: '2026-09-01', to: '2026-09-02' });
  assert.equal(summary.subjects[0].count, 2);
  assert.equal(summary.subjects[0].sum, 16);
  assert.equal(summary.ignoredFuture, 1);
  assert.equal(summarizeLessons([lesson], { from: '2026-09-02', to: '2026-09-03' }).subjects.length, 0);

  const page = await context.newPage();
  const fixture = `<!doctype html><meta charset="utf-8"><a href="#/diary">Дневник</a>
    <div id="toolbar"></div><main></main>
    <script>
      window.moves=[];
      let current=2;
      function render() {
        const index=current;
        const first=Date.UTC(2026,7,31)+index*7*86400000;
        const date=n=>new Date(first+n*86400000).toISOString().slice(0,10);
        const display=n=>date(n).split('-').reverse().join('.');
        document.querySelector('#toolbar').innerHTML='<button><svg><path d="M8 2V6"></path></svg></button><button id="prev" '+(index===0?'disabled':'')+'>Назад</button><button id="next">Вперёд</button>';
        document.querySelector('#prev').onclick=()=>{window.moves.push(['prev',--current]);render()};
        document.querySelector('#next').onclick=()=>{window.moves.push(['next',++current]);render()};
        document.querySelector('main').innerHTML=Array.from({length:6},(_,n)=>'<table><thead><tr><th colspan="4">День '+display(n)+'</th></tr><tr><th>Начало</th><th id="subject">Предмет</th><th>Домашнее задание</th><th id="mark">Отметка</th></tr></thead><tbody></tbody></table>').join('');
        setTimeout(()=>{
          if(current!==index)return;
          const rows=index===0?{0:[['Математика','8'],['Математика','8']],1:[['Английский язык','н']]}:
            index===1?{0:[['Математика','10']],1:[['Математика','Н'],['История',''],['Физкультура','зач']],2:[['Математика','1']]}:
            {0:[['Математика','2']]};
          document.querySelectorAll('tbody').forEach((body,n)=>{
            const lessons=rows[n]||[['','']];
            body.innerHTML=lessons.map((item,i)=>'<tr><td id="'+i+'_start">'+(9+i)+':00</td><td id="'+i+'_subject">'+(item[0]?(i+1)+'. '+item[0]:'')+'</td><td id="'+i+'_homework">В тексте задания числа 5 и 10</td><td id="'+i+'_mark">'+item[1]+'</td></tr>').join('');
          });
        },40);
      }
      render();
    </script>`;
  await page.setRequestInterception(true);
  page.on('request', request => request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }));
  await page.goto('https://diary.e-schools.by/#/diary');
  const report = await collectDiary({ page, to: '2026-09-08' });
  assert.deepEqual(report.period, { from: '2026-08-31', to: '2026-09-08' });
  assert.equal(report.weeks, 2);
  assert.deepEqual(report.totals, { sum: 26, count: 3, absences: 2 });
  const math = report.subjects.find(row => row.subject === 'Математика');
  assert.equal(math.average, 26 / 3);
  assert.equal(math.absences, 1);
  assert.deepEqual(math.events.map(event => event.label), ['8', '8', '10', 'Н']);
  assert.equal(report.subjects.find(row => row.subject === 'История').average, null);
  assert.equal(report.subjects.find(row => row.subject === 'Физкультура').events[0].label, 'зач');
  assert.deepEqual(await page.evaluate(() => window.moves), [['prev', 1], ['prev', 0], ['next', 1]]);
  assert.equal(report.subjects.flatMap(row => row.events).some(event => event.date > '2026-09-08'), false);
  assert.equal(page.isClosed(), false);
  await page.close();
};
