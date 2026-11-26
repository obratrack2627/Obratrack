require('./helpers/typescript.cjs');
const { test } = require('node:test');
const { CONTRACTOR_EVAL_SCENARIOS } = require('../evals/contractor-scenarios.cjs');

for (const scenario of CONTRACTOR_EVAL_SCENARIOS) {
  test(`[Eval ${String(scenario.id).padStart(2, '0')}] ${scenario.name}`, async () => {
    await scenario.run();
  });
}
