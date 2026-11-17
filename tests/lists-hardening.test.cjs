require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeRedirectPath } = require('../middleware.ts');
const { isAllowedPushEndpoint } = require('../lib/push/endpoint.ts');
const { sanitizeExcelCell } = require('../lib/excel-export.ts');

test('sanitizeRedirectPath bloquea open redirect con backslashes, protocolo y control chars', () => {
  assert.equal(sanitizeRedirectPath('/proyectos/p1'), '/proyectos/p1');
  assert.equal(sanitizeRedirectPath('/\\evil.com'), '/dashboard');
  assert.equal(sanitizeRedirectPath('//evil.com'), '/dashboard');
  assert.equal(sanitizeRedirectPath('https://evil.com'), '/dashboard');
  assert.equal(sanitizeRedirectPath('/dashboard\nLocation: evil'), '/dashboard');
});

test('isAllowedPushEndpoint bloquea SSRF a localhost/metadata y permite proveedores Web Push', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123'), true);
  assert.equal(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=xyz'), true);
  assert.equal(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1:8080/internal'), false);
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false);
});

test('sanitizeExcelCell neutraliza fórmulas peligrosas (=, +, -, @)', () => {
  assert.equal(sanitizeExcelCell('=CMD|"/C calc"!A0'), "'=CMD|\"/C calc\"!A0");
  assert.equal(sanitizeExcelCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(sanitizeExcelCell('-1+1'), "'-1+1");
  assert.equal(sanitizeExcelCell('@IMPORTXML()'), "'@IMPORTXML()");
  assert.equal(sanitizeExcelCell('Obra Casa Norte'), 'Obra Casa Norte');
});
