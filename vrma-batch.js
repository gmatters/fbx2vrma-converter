#!/usr/bin/env node

const { Command } = require('commander');
const {
  loadRecipeFiles,
  planBuilds,
  runPlans,
} = require('./lib/batch-runner');

async function main() {
  const program = new Command();
  program
    .name('vrma-batch')
    .description('Batch-build VRMA files from reproducible recipe files')
    .argument('[recipes...]', 'YAML recipe file(s) or globs', ['recipes/main.yaml'])
    .option('--dry-run', 'Show stale/fresh decisions without running conversions')
    .option('--force', 'Regenerate every recipe even when sidecars are fresh')
    .action(async (recipes, options) => {
      const loaded = await loadRecipeFiles(recipes);
      const plans = await planBuilds(loaded, { force: options.force });
      const result = await runPlans(plans, { dryRun: options.dryRun });
      const action = options.dryRun ? 'would build' : 'built';
      console.log(`\nBatch complete: ${action} ${result.built}/${result.total}; skipped ${result.skipped}.`);
    });

  await program.parseAsync();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
