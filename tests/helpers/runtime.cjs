const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const {DatabaseSync} = require('node:sqlite');

const env = {};
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'cloudflare:workers') return {env};
  return originalLoad.apply(this, arguments);
};
const compile = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
}).outputText, filename);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;
require.extensions['.css'] = mod => {mod.exports = {};};

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(path.join(__dirname, '../../drizzle')).filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(__dirname, '../../drizzle', file), 'utf8'));
  }
  function prepare(sql) {
    let values = [];
    return {
      bind(...args) {values = args; return this;},
      async first() {return sqlite.prepare(sql).get(...values) ?? null;},
      async all() {return {results: sqlite.prepare(sql).all(...values)};},
      async run() {const result = sqlite.prepare(sql).run(...values); return {success: true, meta: {changes: Number(result.changes)}};},
    };
  }
  return {prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try {const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result;}
    catch (error) {sqlite.exec('ROLLBACK'); throw error;}
  }, close() {sqlite.close();}};
}
module.exports = {env, createDatabase};
