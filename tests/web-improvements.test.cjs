require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { NextRequest } = require('next/server');

const { deriveEdpPdfPassword: deriveFromPure } = require('../lib/payments/pdf-password.ts');
const { deriveEdpPdfPassword: deriveFromPdf } = require('../lib/payments/pdf.ts');
const { getRedirectBaseUrl } = require('../lib/supabase/auth.ts');
const { middleware, config: middlewareConfig } = require('../middleware.ts');
const robots = require('../app/robots.ts').default;
const sitemap = require('../app/sitemap.ts').default;

const root = path.resolve(__dirname, '..');

function walkTsx(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, list);
    else if (/\.(ts|tsx)$/.test(entry.name)) list.push(full);
  }
  return list;
}

test('deriveEdpPdfPassword se mantiene en módulo puro y re-exportado desde lib/payments/pdf.ts', () => {
  assert.equal(deriveFromPure('76.412.890-K'), '2890');
  assert.equal(deriveFromPure('12.345.678-5'), '5678');
  assert.equal(deriveFromPure(''), null);
  assert.equal(deriveFromPdf, deriveFromPure);
});

test('getRedirectBaseUrl usa https://obratrack-cl.vercel.app cuando no hay window ni env', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  try {
    assert.equal(getRedirectBaseUrl(), 'https://obratrack-cl.vercel.app');
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_APP_URL = prev;
  }
});

test('robots.ts, sitemap.ts y middleware exponen metadatos de rastreo sin exigir sesión', async () => {
  const robotsData = robots();
  assert.match(robotsData.sitemap, /\/sitemap\.xml$/);
  const rules = Array.isArray(robotsData.rules) ? robotsData.rules : [robotsData.rules];
  assert.ok(rules[0].allow.includes('/'));
  assert.ok(rules[0].disallow.includes('/dashboard'));

  const sitemapEntries = sitemap();
  assert.equal(sitemapEntries.length, 2);
  assert.ok(sitemapEntries.some((item) => item.url.endsWith('/precios')));

  for (const publicPath of ['/robots.txt', '/sitemap.xml']) {
    const req = new NextRequest(`https://obratrack-cl.vercel.app${publicPath}`);
    const res = await middleware(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('location'), null);
    assert.ok(middlewareConfig.matcher[0].includes('robots.txt'));
    assert.ok(middlewareConfig.matcher[0].includes('sitemap.xml'));
  }
});

test('regresión estática: sin URLs legacy, sin alert/confirm nativos, links seguros y activos limpios', () => {
  const codeFiles = [
    ...walkTsx(path.join(root, 'app')),
    ...walkTsx(path.join(root, 'components')),
    ...walkTsx(path.join(root, 'lib')),
  ];

  for (const file of codeFiles) {
    const txt = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    assert.equal(/obratrack-5zwn/i.test(txt), false, `URL legacy en ${rel}`);

    if (!file.startsWith(path.join(root, 'lib'))) {
      assert.equal(
        /\b(window\.)?(alert|confirm|prompt)\(/.test(txt),
        false,
        `Diálogo nativo bloqueante en ${rel}`,
      );
      for (const match of txt.matchAll(/target=["']_blank["'][^>]*>/g)) {
        assert.match(match[0], /noopener/, `target=_blank sin noopener en ${rel}`);
      }
    }
  }

  for (const required of [
    'app/error.tsx',
    'app/global-error.tsx',
    'app/not-found.tsx',
    'app/loading.tsx',
    'app/robots.ts',
    'app/sitemap.ts',
    'components/CommandPalette.tsx',
    'components/DashboardFinanceCharts.tsx',
    'components/ProjectFinanzasPieChart.tsx',
    'lib/payments/pdf-password.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(root, required)), true, `Falta archivo ${required}`);
  }

  assert.equal(fs.existsSync(path.join(root, 'public/storyboard_obratrack.jpg')), false);
  assert.equal(fs.existsSync(path.join(root, 'public/storyboard_obratrack_es.jpg')), false);

  const layoutTxt = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
  assert.equal(/\bthemeColor\b/.test(layoutTxt), false, 'app/layout.tsx no debe imponer themeColor');

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal('date-fns' in pkg.dependencies, false);
  assert.equal('frappe-gantt' in pkg.dependencies, false);
});
