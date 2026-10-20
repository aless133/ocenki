const { mkdir, readFile, writeFile, rename } = require('node:fs/promises');
const path = require('node:path');

const directory = path.join(__dirname, 'private', 'reports');
function filename(childId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(childId)) throw new Error('INVALID_CHILD_ID');
  return path.join(directory, `${childId}.json`);
}

async function saveReport(childId, report) {
  await mkdir(directory, { recursive: true });
  const target = filename(childId);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(report, null, 2), 'utf8');
  await rename(temporary, target);
}

async function readReport(childId) {
  try { return JSON.parse(await readFile(filename(childId), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

module.exports = { saveReport, readReport };
