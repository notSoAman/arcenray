import { readFileSync } from 'node:fs';
import { assertOtaRuntime, parseGeneratedFingerprint } from '../src/ota-runtime.ts';
const target = JSON.parse(readFileSync(new URL('../ota-target.json', import.meta.url), 'utf8'));
if (!process.argv[2]) throw new Error('Pass the generated Android fingerprint JSON file.');
const fingerprint = parseGeneratedFingerprint(readFileSync(process.argv[2], 'utf8'));
assertOtaRuntime(fingerprint.hash, target.androidRuntimeVersion);
console.log(`OTA runtime matches installed Android v${target.androidVersionCode}.`);
