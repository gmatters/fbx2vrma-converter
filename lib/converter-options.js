const path = require('path');

const CONVERTER_OPTION_SCHEMA = {
  boneProfile: { cli: '--bone-profile', type: 'string', default: 'default' },
  bakeFramerate: { cli: '--bake-framerate', type: 'number' },
  trimIn: { cli: '--trim-in', type: 'number' },
  trimOut: { cli: '--trim-out', type: 'number' },
  trimInFrame: { cli: '--trim-in-frame', type: 'number' },
  trimOutFrame: { cli: '--trim-out-frame', type: 'number' },
  loopSmoothing: { cli: '--loop-smoothing', type: 'number', default: 0 },
  shiftHipOrigin: { cliFalse: '--no-shift-hip-origin', type: 'boolean', default: true },
  corrections: { cli: '--apply-corrections', type: 'path' },
  restPose: { cli: '--apply-rest-pose', type: 'path' },
  dumpNodes: { cli: '--dump-nodes', type: 'path' },
};

function normalizeConverterOptions(...optionSets) {
  const merged = {};
  for (const optionSet of optionSets) {
    if (!optionSet) continue;
    for (const [key, value] of Object.entries(optionSet)) {
      if (value !== undefined && value !== null) merged[key] = value;
    }
  }

  const normalized = {};
  for (const [key, schema] of Object.entries(CONVERTER_OPTION_SCHEMA)) {
    const value = merged[key] !== undefined ? merged[key] : schema.default;
    if (value === undefined || value === null || value === '') continue;
    normalized[key] = normalizeOptionValue(key, value, schema.type);
  }

  if (normalized.trimIn !== undefined && normalized.trimInFrame !== undefined) {
    throw new Error('Use either trimIn or trimInFrame, not both');
  }
  if (normalized.trimOut !== undefined && normalized.trimOutFrame !== undefined) {
    throw new Error('Use either trimOut or trimOutFrame, not both');
  }

  return normalized;
}

function normalizeOptionValue(key, value, type) {
  if (type === 'boolean') return Boolean(value);
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`${key} must be a number`);
    }
    return number;
  }
  if (type === 'path') return String(value);
  return String(value);
}

function buildConverterArgv(options, { input, output, fbx2gltf } = {}) {
  const argv = [];
  if (fbx2gltf) argv.push('--fbx2gltf', fbx2gltf);

  for (const [key, schema] of Object.entries(CONVERTER_OPTION_SCHEMA)) {
    const value = options[key];
    if (value === undefined || value === null || value === '') continue;
    if (schema.cliFalse) {
      if (value === false) argv.push(schema.cliFalse);
      continue;
    }
    argv.push(schema.cli, String(value));
  }

  if (output) argv.push('-o', output);
  if (input) argv.push('-i', input);
  return argv;
}

function getReferencedConfigPaths(options, baseDir = process.cwd()) {
  return ['corrections', 'restPose']
    .map(key => options[key])
    .filter(Boolean)
    .map(filePath => path.resolve(baseDir, filePath));
}

module.exports = {
  CONVERTER_OPTION_SCHEMA,
  normalizeConverterOptions,
  buildConverterArgv,
  getReferencedConfigPaths,
};
