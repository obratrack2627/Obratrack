require('../tests/helpers/typescript.cjs');
const assert = require('node:assert/strict');
const { CONTRACTOR_EVAL_SCENARIOS, runDeterministicContractorEvals } = require('../evals/contractor-scenarios.cjs');

async function main() {
  const { passed, failed, failures } = await runDeterministicContractorEvals();
  console.log(`\n[Contractor Evals] Deterministas: ${passed}/${CONTRACTOR_EVAL_SCENARIOS.length} aprobados.`);
  if (failed > 0) {
    for (const f of failures) {
      console.error(`  FAIL [${f.id}] ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }

  if (process.env.OBRABOT_LIVE_EVALS === '1') {
    const { classifyTurnIntent } = require('../lib/ai/intent-router.ts');
    const liveCases = [
      {
        text: 'quiero que dejes el total en 1.800.000',
        expectedIntent: 'editar_cotizacion',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true, hasPendingQuoteReview: true },
      },
      {
        text: 'sácale la fecha al pdf porfa',
        expectedIntent: 'editar_cotizacion',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true, hasPendingQuoteReview: true },
      },
      {
        text: 'agrega también el presupuesto a la obra',
        expectedIntent: 'aplicar_cotizacion_a_obra',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true, activeProjectName: 'Remodelación baño Maipú' },
      },
      {
        text: 'crea la obra con esa cotización para Claudio Zapata',
        expectedIntent: 'crear_obra_desde_cotizacion',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true },
      },
      {
        text: 'mándame la planilla excel',
        expectedIntent: 'descargar_archivo_cotizacion',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true },
      },
      {
        text: 'dale, apruébala y mándame el pdf',
        expectedIntent: 'aprobar_cotizacion',
        ctx: { channel: 'whatsapp', rol: 'admin', hasActiveQuote: true, hasPendingQuoteReview: true },
      },
    ];

    let livePassed = 0;
    for (const item of liveCases) {
      const res = await classifyTurnIntent(item.text, item.ctx);
      const ok = res?.intent === item.expectedIntent;
      if (ok) livePassed += 1;
      console.log(`  LIVE ${ok ? 'PASS' : 'FAIL'}: "${item.text}" -> ${res?.intent ?? 'null'} (esperado ${item.expectedIntent})`);
    }
    const accuracy = (livePassed / liveCases.length) * 100;
    console.log(`[Contractor Evals] Live LLM: ${livePassed}/${liveCases.length} (${accuracy.toFixed(1)}%).`);
    assert.ok(accuracy >= 80, `Live accuracy ${accuracy.toFixed(1)}% < 80%`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
