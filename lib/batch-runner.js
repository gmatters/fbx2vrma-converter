const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const YAML = require('yaml');
const fg = require('fast-glob');
const {
  buildConverterArgv,
  getReferencedConfigPaths,
  normalizeConverterOptions,
} = require('./converter-options');
const { sha256File, sha256Json } = require('./hash');

const BUILD_SCHEMA_VERSION = 1;

async function loadRecipeFiles(recipePaths) {
  const files = await expandRecipePaths(recipePaths);
  const recipes = [];
  for (const file of files) {
    const document = YAML.parse(await fs.readFile(file, 'utf8')) || {};
    recipes.push(...expandRecipeDocument(document, file));
  }
  return recipes;
}

async function expandRecipePaths(recipePaths) {
  if (!recipePaths.length) {
    throw new Error('At least one recipe file is required');
  }
  const matches = await fg(recipePaths, {
    absolute: true,
    onlyFiles: true,
    unique: true,
  });
  if (matches.length === 0) {
    throw new Error(`No recipe files matched: ${recipePaths.join(', ')}`);
  }
  return matches.sort();
}

function expandRecipeDocument(document, recipeFile) {
  const baseDir = path.dirname(recipeFile);
  const defaults = document.defaults || {};
  const trimSets = document.trimSets || {};
  const recipes = [];

  for (const node of document.builds || []) {
    recipes.push(...expandNestedRecipeNode(node, createRootScope(defaults), { recipeFile, baseDir }));
  }
  for (const node of document.outputs || []) {
    recipes.push(...expandNestedRecipeNode(node, createRootScope(defaults), { recipeFile, baseDir }));
  }

  for (const recipe of document.recipes || []) {
    recipes.push(normalizeRecipeEntry(recipe, { defaults, trimSets, recipeFile, baseDir }));
  }

  for (const [groupId, group] of Object.entries(document.groups || {})) {
    for (const output of group.outputs || []) {
      recipes.push(normalizeRecipeEntry({
        ...group,
        ...output,
        id: output.id || `${groupId}.${output.file || output.output}`,
        output: output.output || output.file,
        outputs: undefined,
      }, { defaults, trimSets, recipeFile, baseDir }));
    }
  }

  return recipes;
}

function createRootScope(defaults) {
  return {
    converter: defaults.converter,
    fbx2gltf: defaults.fbx2gltf,
    inputDir: defaults.inputDir,
    outputDir: defaults.outputDir,
    input: defaults.input,
    args: defaults.args || {},
    trim: defaults.trim || {},
  };
}

function expandNestedRecipeNode(node, inherited, context) {
  if (!node || typeof node !== 'object') {
    throw new Error(`${context.recipeFile}: nested recipe entries must be objects`);
  }

  const scope = applyNestedOverrides(inherited, node);
  const children = node.outputs || node.builds;
  if (children) {
    if (!Array.isArray(children)) {
      throw new Error(`${context.recipeFile}: outputs/builds must be arrays`);
    }
    return children.flatMap(child => expandNestedRecipeNode(child, scope, context));
  }

  if (!scope.output) {
    throw new Error(`${context.recipeFile}: nested recipe leaf is missing output`);
  }
  return [normalizeRecipeEntry({
    id: scope.id || createRecipeId(scope.output),
    converter: scope.converter,
    fbx2gltf: scope.fbx2gltf,
    inputDir: scope.inputDir,
    outputDir: scope.outputDir,
    input: scope.input,
    output: scope.output,
    args: scope.args,
    trim: scope.trim,
    corrections: scope.corrections,
    restPose: scope.restPose,
    dumpNodes: scope.dumpNodes,
  }, {
    defaults: {},
    trimSets: {},
    recipeFile: context.recipeFile,
    baseDir: context.baseDir,
  })];
}

function applyNestedOverrides(inherited, node) {
  const scope = {
    ...inherited,
    args: { ...(inherited.args || {}) },
    trim: { ...(inherited.trim || {}) },
  };

  for (const key of ['id', 'converter', 'fbx2gltf', 'inputDir', 'outputDir', 'input', 'output', 'corrections', 'restPose', 'dumpNodes']) {
    if (node[key] !== undefined) scope[key] = node[key];
  }
  if (node.file !== undefined) scope.output = node.file;
  if (node.args) Object.assign(scope.args, node.args);
  if (node.trim) Object.assign(scope.trim, node.trim);

  const trimAliases = {
    in: 'in',
    out: 'out',
    inFrame: 'inFrame',
    outFrame: 'outFrame',
    trimIn: 'trimIn',
    trimOut: 'trimOut',
    trimInFrame: 'trimInFrame',
    trimOutFrame: 'trimOutFrame',
    loopSmoothing: 'loopSmoothing',
  };
  for (const [sourceKey, targetKey] of Object.entries(trimAliases)) {
    if (node[sourceKey] !== undefined) scope.trim[targetKey] = node[sourceKey];
  }

  for (const key of ['boneProfile', 'bakeFramerate', 'shiftHipOrigin']) {
    if (node[key] !== undefined) scope.args[key] = node[key];
  }

  return scope;
}

function createRecipeId(output) {
  return path.basename(String(output), path.extname(String(output)));
}

function normalizeRecipeEntry(entry, { defaults, trimSets, recipeFile, baseDir }) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`${recipeFile}: recipe entries must be objects`);
  }
  const id = entry.id;
  if (!id) throw new Error(`${recipeFile}: recipe is missing id`);

  const trim = mergeTrim(defaults.trim, trimSets, entry.useTrim, entry.trim);
  const args = normalizeConverterOptions(defaults.args, entry.args, trim, {
    corrections: entry.corrections,
    restPose: entry.restPose,
    dumpNodes: entry.dumpNodes,
  });
  for (const key of ['corrections', 'restPose', 'dumpNodes']) {
    if (args[key]) args[key] = resolveMaybeRelative(args[key], baseDir);
  }

  const inputDir = resolveMaybeRelative(entry.inputDir || defaults.inputDir || '.', baseDir);
  const outputDir = resolveMaybeRelative(entry.outputDir || defaults.outputDir || '.', baseDir);
  const converter = entry.converter
    ? resolveMaybeRelative(entry.converter, baseDir)
    : defaults.converter
      ? resolveMaybeRelative(defaults.converter, baseDir)
      : path.resolve(process.cwd(), './fbx2vrma-converter.js');
  const fbx2gltf = entry.fbx2gltf || defaults.fbx2gltf;
  const input = entry.input ?? defaults.input;
  const output = entry.output ?? entry.file;

  if (!input) throw new Error(`${recipeFile}: recipe ${id} is missing input`);
  if (!output) throw new Error(`${recipeFile}: recipe ${id} is missing output`);

  return {
    schemaVersion: BUILD_SCHEMA_VERSION,
    id: String(id),
    recipeFile,
    baseDir,
    inputDir,
    outputDir,
    inputSpec: normalizeInputSpec(input),
    output: path.resolve(outputDir, output),
    converter,
    fbx2gltf: fbx2gltf ? resolveMaybeRelative(fbx2gltf, baseDir) : undefined,
    args,
  };
}

function mergeTrim(defaultTrim, trimSets, useTrim, inlineTrim) {
  const trim = { ...(defaultTrim || {}) };
  if (useTrim) {
    const namedTrim = trimSets[useTrim];
    if (!namedTrim) throw new Error(`Unknown trim set "${useTrim}"`);
    Object.assign(trim, namedTrim);
  }
  Object.assign(trim, inlineTrim || {});

  return {
    trimIn: trim.in ?? trim.trimIn,
    trimOut: trim.out ?? trim.trimOut,
    trimInFrame: trim.inFrame ?? trim.trimInFrame,
    trimOutFrame: trim.outFrame ?? trim.trimOutFrame,
    loopSmoothing: trim.loopSmoothing,
  };
}

function normalizeInputSpec(input) {
  if (typeof input === 'string') {
    return { pattern: input, version: hasGlob(input) ? 'latest' : 'exact' };
  }
  if (input && typeof input === 'object') {
    return {
      pattern: input.pattern || input.file,
      version: input.version ?? (hasGlob(input.pattern || input.file || '') ? 'latest' : 'exact'),
    };
  }
  throw new Error('input must be a string or object');
}

function resolveMaybeRelative(filePath, baseDir) {
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  return path.resolve(baseDir, filePath);
}

function hasGlob(pattern) {
  return /[*?[\]{}()!+@]/.test(pattern);
}

async function selectInputFile(recipe) {
  const pattern = recipe.inputSpec.pattern;
  if (!pattern) throw new Error(`${recipe.id}: input pattern is required`);
  const absolutePattern = path.isAbsolute(pattern) ? pattern : path.join(recipe.inputDir, pattern);

  if (!hasGlob(absolutePattern)) {
    if (!await fs.pathExists(absolutePattern)) {
      throw new Error(`${recipe.id}: input file not found: ${absolutePattern}`);
    }
    return path.normalize(absolutePattern);
  }

  const matches = (await fg(absolutePattern, { absolute: true, onlyFiles: true })).sort();
  if (matches.length === 0) {
    throw new Error(`${recipe.id}: no input files matched ${absolutePattern}`);
  }

  if (recipe.inputSpec.version === 'latest') {
    return selectLatestVersion(matches);
  }
  if (recipe.inputSpec.version === 'exact') {
    if (matches.length !== 1) {
      throw new Error(`${recipe.id}: exact glob matched ${matches.length} files; use version: latest or a concrete file`);
    }
    return matches[0];
  }

  const requestedVersion = parseVersionToken(recipe.inputSpec.version);
  if (!requestedVersion) {
    throw new Error(`${recipe.id}: version must be latest, exact, an integer, or a value like 20f`);
  }
  const match = matches.find(file => {
    const parsed = parseVersion(file);
    return parsed && compareVersions(parsed, requestedVersion) === 0;
  });
  if (!match) {
    throw new Error(`${recipe.id}: no input matched version ${recipe.inputSpec.version}`);
  }
  return match;
}

function selectLatestVersion(files) {
  const ranked = files.map(file => ({ file, version: parseVersion(file) }));
  const versioned = ranked.filter(item => item.version !== undefined);
  if (versioned.length > 0) {
    versioned.sort((a, b) => compareVersions(b.version, a.version) || a.file.localeCompare(b.file));
    return versioned[0].file;
  }
  ranked.sort((a, b) => a.file.localeCompare(b.file));
  return ranked[ranked.length - 1].file;
}

function parseVersion(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(/(?:^|[_-])v(\d+)([a-z]*)$/i);
  return match ? { major: Number(match[1]), suffix: match[2].toLowerCase() } : undefined;
}

function parseVersionToken(value) {
  if (Number.isInteger(value)) return { major: value, suffix: '' };
  const match = String(value).match(/^v?(\d+)([a-z]*)$/i);
  return match ? { major: Number(match[1]), suffix: match[2].toLowerCase() } : undefined;
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  return compareAlphabetSuffix(a.suffix, b.suffix);
}

function compareAlphabetSuffix(a, b) {
  if (a === b) return 0;
  if (a === '') return -1;
  if (b === '') return 1;
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

async function createBuildSpec(recipe) {
  const input = await selectInputFile(recipe);
  const argv = buildConverterArgv(recipe.args, {
    input,
    output: recipe.output,
    fbx2gltf: recipe.fbx2gltf,
  });
  const configFiles = getReferencedConfigPaths(recipe.args, recipe.baseDir);
  const normalizedRecipe = {
    id: recipe.id,
    inputSpec: recipe.inputSpec,
    output: recipe.output,
    converter: recipe.converter,
    fbx2gltf: recipe.fbx2gltf,
    args: recipe.args,
  };

  return {
    schemaVersion: BUILD_SCHEMA_VERSION,
    recipeId: recipe.id,
    recipeFile: recipe.recipeFile,
    inputFile: input,
    outputFile: recipe.output,
    converterFile: recipe.converter,
    fbx2gltf: recipe.fbx2gltf,
    argv,
    normalizedRecipe,
    recipeHash: sha256Json(normalizedRecipe),
    inputSha256: await sha256File(input),
    converterSha256: await sha256File(recipe.converter),
    fbx2gltfSha256: recipe.fbx2gltf ? await sha256File(recipe.fbx2gltf) : undefined,
    configFiles: await Promise.all(configFiles.map(async file => ({
      file,
      sha256: await sha256File(file),
    }))),
  };
}

function sidecarPath(outputFile) {
  return `${outputFile}.build.json`;
}

async function explainFreshness(buildSpec) {
  const outputExists = await fs.pathExists(buildSpec.outputFile);
  const sidecarFile = sidecarPath(buildSpec.outputFile);
  const sidecarExists = await fs.pathExists(sidecarFile);
  if (!outputExists) return { fresh: false, reasons: ['output missing'] };
  if (!sidecarExists) return { fresh: false, reasons: ['sidecar missing'] };

  const previous = await fs.readJson(sidecarFile).catch(error => {
    throw new Error(`Could not read sidecar ${sidecarFile}: ${error.message}`);
  });
  const checks = [
    ['schema version changed', previous.schemaVersion, buildSpec.schemaVersion],
    ['recipe changed', previous.recipeHash, buildSpec.recipeHash],
    ['input selection changed', previous.inputFile, buildSpec.inputFile],
    ['input content changed', previous.inputSha256, buildSpec.inputSha256],
    ['converter changed', previous.converterSha256, buildSpec.converterSha256],
    ['FBX2glTF binary changed', previous.fbx2gltfSha256, buildSpec.fbx2gltfSha256],
    ['argv changed', JSON.stringify(previous.argv), JSON.stringify(buildSpec.argv)],
    ['config files changed', JSON.stringify(previous.configFiles || []), JSON.stringify(buildSpec.configFiles || [])],
  ];
  const reasons = checks
    .filter(([, previousValue, currentValue]) => previousValue !== currentValue)
    .map(([reason]) => reason);

  return { fresh: reasons.length === 0, reasons };
}

async function planBuilds(recipes, { force = false } = {}) {
  const plans = [];
  const seenOutputs = new Set();
  for (const recipe of recipes) {
    if (seenOutputs.has(recipe.output)) {
      throw new Error(`Duplicate output in recipes: ${recipe.output}`);
    }
    seenOutputs.add(recipe.output);
    const buildSpec = await createBuildSpec(recipe);
    const freshness = force
      ? { fresh: false, reasons: ['forced'] }
      : await explainFreshness(buildSpec);
    plans.push({
      recipe,
      buildSpec,
      fresh: freshness.fresh,
      reasons: freshness.reasons,
    });
  }
  return plans;
}

async function runPlans(plans, { dryRun = false } = {}) {
  let built = 0;
  let skipped = 0;
  for (const plan of plans) {
    printPlan(plan);
    if (plan.fresh) {
      skipped++;
      continue;
    }
    if (dryRun) {
      built++;
      continue;
    }
    await fs.ensureDir(path.dirname(plan.buildSpec.outputFile));
    await runConverter(plan.buildSpec);
    await writeSidecar(plan.buildSpec);
    built++;
  }
  return { built, skipped, total: plans.length };
}

function printPlan(plan) {
  const status = plan.fresh ? 'FRESH' : 'STALE';
  console.log(`${status}  ${plan.buildSpec.outputFile}`);
  for (const reason of plan.reasons || []) {
    console.log(`       ${reason}`);
  }
}

function runConverter(buildSpec) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildSpec.converterFile, ...buildSpec.argv], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Converter failed for ${buildSpec.outputFile} with exit code ${code}`));
    });
  });
}

async function writeSidecar(buildSpec) {
  await fs.writeJson(sidecarPath(buildSpec.outputFile), {
    schemaVersion: buildSpec.schemaVersion,
    recipeId: buildSpec.recipeId,
    recipeFile: buildSpec.recipeFile,
    inputFile: buildSpec.inputFile,
    inputSha256: buildSpec.inputSha256,
    outputFile: buildSpec.outputFile,
    converterFile: buildSpec.converterFile,
    converterSha256: buildSpec.converterSha256,
    fbx2gltf: buildSpec.fbx2gltf,
    fbx2gltfSha256: buildSpec.fbx2gltfSha256,
    argv: buildSpec.argv,
    normalizedRecipe: buildSpec.normalizedRecipe,
    recipeHash: buildSpec.recipeHash,
    configFiles: buildSpec.configFiles,
    createdAt: new Date().toISOString(),
  }, { spaces: 2 });
}

module.exports = {
  BUILD_SCHEMA_VERSION,
  compareVersions,
  createBuildSpec,
  expandRecipeDocument,
  explainFreshness,
  loadRecipeFiles,
  parseVersion,
  parseVersionToken,
  planBuilds,
  runPlans,
  selectInputFile,
  selectLatestVersion,
  sidecarPath,
  writeSidecar,
};
