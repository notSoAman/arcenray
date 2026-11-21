import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOtaRuntime, parseGeneratedFingerprint } from '../src/ota-runtime.ts';
test('OTA delivery only accepts the runtime installed by closed testers',()=>{
 assert.doesNotThrow(()=>assertOtaRuntime('installed','installed'));
 assert.throws(()=>assertOtaRuntime('new-native-module','installed'),/Play build/);
 assert.throws(()=>assertOtaRuntime(undefined,'installed'),/fingerprint/);
});

test('the runtime guard accepts EAS environment notices before fingerprint JSON',()=>{
 assert.deepEqual(
   parseGeneratedFingerprint(
     'Environment variables with visibility "Plain text" loaded from EAS.\n\n{"hash":"8efba0e0e1f93551c796b66a05a44ae99d9d6368"}\n',
   ),
   { hash: '8efba0e0e1f93551c796b66a05a44ae99d9d6368' },
 );
});
