import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../editor-core.mjs';

test('section metadata cannot remove original sections or introduce invalid IDs',()=>{
  assert.equal(typeof model.normalizeSections,'function');
  const base=[{id:'page1',num:'01',label:'Original'}];
  const result=model.normalizeSections(JSON.stringify([{id:'custom-a',label:'New'},{id:'../bad',label:'Bad'},{id:'custom-a',label:'Duplicate'}]),base);
  assert.deepEqual(result,[{id:'custom-a',label:'New',num:'01'},{id:'page1',label:'Original',num:'02'}]);
});
test('HSV picker returns exact RGB colors and clamps controls',()=>{
  assert.equal(typeof model.hsvHex,'function');
  assert.equal(model.hsvHex(120,100,100),'#00ff00');
  assert.equal(model.hsvHex(0,0,100),'#ffffff');
  assert.equal(model.hsvHex(360,200,100),'#ff0000');
});
test('draft recovery preserves revision and rejects malformed snapshots',()=>{
  assert.equal(typeof model.readDraft,'function');
  assert.equal(model.readDraft('{bad'),null);
  assert.equal(model.readDraft(JSON.stringify({content:{page1:123},revision:4})),null);
  assert.deepEqual(model.readDraft(JSON.stringify({content:{page1:'latest'},revision:4,active:'page1'})),{content:{page1:'latest'},revision:4,active:'page1'});
});
test('source snapshot cannot silently omit original charter pages',()=>{
  assert.equal(typeof model.sourceSnapshot,'function');
  assert.throws(()=>model.sourceSnapshot({page1:'partial'},4),/исходных/);
  const content=Object.fromEntries(Array.from({length:8},(_,i)=>['page'+(i+1),'<p>Rule</p>']));
  content.__sections='[{"id":"custom-new","label":"New"}]';content['custom-new']='More';
  const result=JSON.parse(model.sourceSnapshot(content,4));
  assert.equal(result.content['custom-new'],'More');assert.equal(result.revision,4);
});
