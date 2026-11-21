import assert from 'node:assert/strict';
import test from 'node:test';
import { redirectSystemPath } from '../app/+native-intent.ts';
test('Clerk return links keep the sign-in screen mounted while the session is finalized',()=>{
 assert.equal(redirectSystemPath({path:'clerk://com.arcenray.mobile.hosted-callback?rotating_token_nonce=fixture',initial:false}),'/sign-in');
 assert.equal(redirectSystemPath({path:'clerk://com.arcenray.mobile.dev.hosted-callback?rotating_token_nonce=fixture',initial:true}),'/sign-in');
});
test('ordinary film links and untrusted callback hosts are not rewritten',()=>{
 assert.equal(redirectSystemPath({path:'arcenray://film/film-id',initial:false}),'arcenray://film/film-id');
 assert.equal(redirectSystemPath({path:'https://other.example/hosted-callback',initial:false}),'https://other.example/hosted-callback');
});
