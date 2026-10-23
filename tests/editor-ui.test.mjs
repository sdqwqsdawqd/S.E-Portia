import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {mountEditor} from '../content-editor.js';

async function setup(){
  const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://example.test/?edit=1',runScripts:'outside-only'});
  const w=dom.window;
  for(const key of ['window','document','location','localStorage','Event','Option','getComputedStyle'])globalThis[key]=key==='window'?w:key==='getComputedStyle'?w.getComputedStyle.bind(w):w[key];
  globalThis.CSS={highlights:new Map()};globalThis.confirm=()=>true;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.eval(await readFile(new URL('../charter-theme.js',import.meta.url),'utf8'));
  const sections=Array.from({length:8},(_,i)=>({id:`page${i+1}`,num:`0${i+1}`,label:`Section ${i+1}`}));
  await mountEditor({sections,getSection:async()=>'<p>Alpha</p><p>Beta</p>',getStyles:()=>'{}',getRevision:()=>4,getUpdatedAt:()=>null});
  return {w,dom,$:selector=>w.document.querySelector(selector)};
}
test('multiple selected fragments receive font size and undo restores original markup',async()=>{
  const {w,dom,$}=await setup();
  const canvas=$('.charter-editor-canvas');
  $('[data-all]').click();
  const size=$('[data-font-size]');size.value='24';size.dispatchEvent(new w.Event('change'));
  assert.equal(canvas.querySelectorAll('span[style="font-size: 24px;"]').length,2);
  assert.equal(JSON.parse(localStorage.getItem('portia-owner-draft-v1')).content.page1,canvas.innerHTML);
  $('[data-undo]').click();assert.equal(canvas.innerHTML,'<p>Alpha</p><p>Beta</p>');
  dom.window.close();
});
test('adding, renaming and undoing a section retains all original content',async()=>{
  const {dom,$}=await setup();$('[data-section-add]').click();
  assert.equal(document.querySelectorAll('[data-section]').length,9);
  $('[data-section-name]').value='New rules';$('[data-section-rename]').click();
  assert.match($('.charter-editor-tabs').textContent,/New rules/);
  $('[data-undo]').click();$('[data-undo]').click();
  assert.equal(document.querySelectorAll('[data-section]').length,8);
  assert.equal($('.charter-editor-canvas').innerHTML,'<p>Alpha</p><p>Beta</p>');dom.window.close();
});
test('new leader photo can be filled by URL without replacing the card',async()=>{
  const {dom,$}=await setup();$('[data-leader-name]').value='Leader';$('[data-leader-save]').click();
  $('[data-media-url]').value='https://example.test/photo.png';$('[data-replace-media]').click();
  assert.equal($('.leadership-card .leader-photo img')?.getAttribute('src'),'https://example.test/photo.png');
  assert.equal($('.leader-details strong').textContent,'Leader');dom.window.close();
});
test('source mode cannot mutate hidden media or leadership content',async()=>{
  const {dom,$}=await setup();$('[data-source]').click();
  $('[data-leader-name]').value='Hidden';$('[data-leader-save]').click();
  assert.equal($('.leadership-card'),null);dom.window.close();
});
test('undoing to published state removes the stale recovery draft',async()=>{
  const {dom,$}=await setup();$('[data-all]').click();$('[data-style="fontWeight"]').click();
  assert.ok(localStorage.getItem('portia-owner-draft-v1'));
  $('[data-undo]').click();assert.equal(localStorage.getItem('portia-owner-draft-v1'),null);dom.window.close();
});
test('Ctrl Alt K opens styles without changing any content',async()=>{
  const {w,dom,$}=await setup();const before=$('.charter-editor-canvas').innerHTML;
  $('.charter-editor-dialog').dispatchEvent(new w.KeyboardEvent('keydown',{ctrlKey:true,altKey:true,code:'KeyK',key:'k',bubbles:true}));
  assert.equal($('[data-tool-panel="styles"]').hidden,false);assert.equal($('.charter-editor-canvas').innerHTML,before);dom.window.close();
});
test('custom picker updates RGB and opacity without an OS color input',async()=>{
  const {w,dom,$}=await setup();
  assert.equal(document.querySelectorAll('input[type=color]').length,0);
  const picker=$('[data-color]').nextElementSibling;
  const hue=picker.querySelector('[data-hue]');hue.value='120';hue.dispatchEvent(new w.Event('input'));
  const rgb=picker.querySelectorAll('input[type=number]');rgb[0].value='255';rgb[1].value='0';rgb[2].value='0';rgb[0].dispatchEvent(new w.Event('change'));
  assert.equal($('[data-color]').value,'#ff0000');
  const alpha=picker.querySelector('[data-alpha]');alpha.value='50';alpha.dispatchEvent(new w.Event('input'));
  assert.equal($('[data-color]').value,'#ff00007f');
  $('[data-all]').click();$('[data-apply-color]').click();
  assert.match($('.charter-editor-canvas span').style.color,/rgba\(255, 0, 0, 0\.498/);dom.window.close();
});
test('choosing another leadership card targets its photo rather than the previous card',async()=>{
  const {w,dom,$}=await setup();
  $('[data-leader-name]').value='First';$('[data-leader-save]').click();
  const select=$('[data-leader-select]');select.value='';select.dispatchEvent(new w.Event('change'));
  $('[data-leader-name]').value='Second';$('[data-leader-save]').click();
  select.value='0';select.dispatchEvent(new w.Event('change'));
  $('[data-media-url]').value='https://example.test/first.png';$('[data-replace-media]').click();
  const cards=document.querySelectorAll('.leadership-card');
  assert.equal(cards[0].querySelector('img')?.getAttribute('src'),'https://example.test/first.png');
  assert.equal(cards[1].querySelector('img'),null);dom.window.close();
});
test('editing a formatted leader name does not replace the biography with nested name text',async()=>{
  const {w,dom,$}=await setup();
  const canvas=$('.charter-editor-canvas');canvas.innerHTML='<div class="leadership-grid"><article class="leadership-card"><div class="leader-photo"></div><div class="leader-details"><strong><span style="color: red;">Alice</span></strong><span><b>Original biography</b></span></div></article></div>';
  canvas.dispatchEvent(new w.Event('input'));
  $('.leadership-card').click();
  assert.equal($('[data-leader-description]').value,'Original biography');
  $('[data-leader-name]').value='Alicia';$('[data-leader-save]').click();
  assert.equal($('.leader-details > span').innerHTML,'<b>Original biography</b>');dom.window.close();
});
