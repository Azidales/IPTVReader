'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nativeWindowId}=require('./mpv.cjs');
test('interpreta HWND unsigned do Electron sem produzir identificador negativo',()=>{
  assert.equal(nativeWindowId(Buffer.from([0xfe,0xff,0xff,0xff,0,0,0,0])),4294967294);
  assert.throws(()=>nativeWindowId(Buffer.alloc(8)),/superfície nativa/);
  assert.throws(()=>nativeWindowId(Buffer.alloc(2)),/inválido/);
});
