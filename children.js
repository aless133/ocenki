const { mkdir, readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');

const directory = path.join(__dirname, 'private', 'children');

async function initializeStorage() {
  await mkdir(directory, { recursive: true });
}

// Full records stay in Node.js; later the parser can read credentials here.
async function readChildren() {
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.env'))
    .map((entry) => entry.name)
    .sort();
  const children = [];
  for (const filename of filenames) {
    const id = filename.slice(0, -4);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('Используйте латинские буквы, цифры, дефис и подчёркивание в именах файлов детей.');
    }
    // parse() keeps each child's variables separate and does not modify process.env.
    const config = dotenv.parse(await readFile(path.join(directory, filename), 'utf8'));
    const fields = ['ALIAS', 'PROVIDER', 'SERVER', 'LOGIN', 'PASSWORD'];
    if (fields.some((field) => !config[field]?.trim())) {
      throw new Error('В каждом .env заполните ALIAS, PROVIDER, SERVER, LOGIN и PASSWORD.');
    }
    const child = {
      id,
      alias: config.ALIAS,
      provider: config.PROVIDER,
      server: config.SERVER,
      login: config.LOGIN,
      password: config.PASSWORD,
    };

    const url = new URL(child.server);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Поле server должно содержать адрес HTTP или HTTPS без реквизитов входа.');
    }
    children.push(child);
  }
  return children;
}

async function listChildren() {
  const children = await readChildren();
  return children.map(({ id, alias }) => ({ id, alias }));
}

module.exports = { initializeStorage, readChildren, listChildren };
