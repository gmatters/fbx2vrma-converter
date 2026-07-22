const crypto = require('crypto');
const fs = require('fs-extra');

function stableStringify(value) {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortForJson(value[key]);
    return result;
  }, {});
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sha256File(filePath) {
  return sha256Buffer(await fs.readFile(filePath));
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(stableStringify(value), 'utf8'));
}

module.exports = {
  stableStringify,
  sha256Buffer,
  sha256File,
  sha256Json,
};
