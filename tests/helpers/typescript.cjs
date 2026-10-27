const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return resolve.call(this, name, ...args);
};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
module.exports = { root };
