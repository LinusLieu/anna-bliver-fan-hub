'use strict';

const fs = require('node:fs');
const path = require('node:path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const sourcePath = path.join(__dirname, 'attribution-guard.source.js');
const outputPath = path.join(__dirname, '..', 'public', 'attribution-guard.js');
const checkOnly = process.argv.includes('--check');

const banner = [
  '/*!',
  ' * Anna BLive Fan Hub attribution guard - generated file.',
  ' * Copyright (C) 2026 Linus_Lieu. GNU GPLv3-or-later; see LICENSE and NOTICE.',
  ' * Do not edit this generated asset directly. Edit scripts/attribution-guard.source.js.',
  ' */',
  ''
].join('\n');

const source = fs.readFileSync(sourcePath, 'utf8');
const result = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.35,
  identifierNamesGenerator: 'hexadecimal',
  ignoreImports: true,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  sourceMap: false,
  splitStrings: true,
  splitStringsChunkLength: 4,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersCount: 4,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  target: 'browser',
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  seed: 20260722
});

const generated = `${banner}${result.getObfuscatedCode()}\n`;
if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== generated) {
    console.error('attribution-guard.js is missing or stale. Run npm run protect:attribution.');
    process.exitCode = 1;
  } else {
    console.log('Attribution guard is current.');
  }
} else {
  fs.writeFileSync(outputPath, generated, 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${generated.length} bytes).`);
}
