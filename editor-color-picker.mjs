import {hsvHex} from './editor-core.mjs';

// The original text input remains the form value; this control never opens an OS picker.
export function mountColorPicker(input, palette) {
  input.type='text'; input.maxLength=9; input.placeholder='#RRGGBB';
  const box=document.createElement('details');box.className='editor-picker';
  box.innerHTML=`<summary>Палитра <span class="picker-sample"></span></summary><div class="picker-sv" tabindex="0" role="group" aria-label="Насыщенность и яркость; стрелки меняют цвет"><span></span></div><label>Оттенок<input type="range" min="0" max="359" value="160" data-hue></label><label>Непрозрачность<input type="range" min="0" max="100" value="100" data-alpha></label><div class="picker-rgb"><label>R<input type="number" min="0" max="255"></label><label>G<input type="number" min="0" max="255"></label><label>B<input type="number" min="0" max="255"></label></div><div class="editor-swatches" data-palette></div><small>Последние цвета</small><div class="editor-swatches" data-recent></div>`;
  input.after(box);
  const sv=box.querySelector('.picker-sv'),hue=box.querySelector('[data-hue]'),alpha=box.querySelector('[data-alpha]');
  const rgb=[...box.querySelectorAll('input[type=number]')];let h=160,s=70,v=70;
  let recent=[];try{recent=JSON.parse(localStorage.getItem('portia-colors')||'[]');if(!Array.isArray(recent))recent=[];}catch{}
  function swatches(target,colors){target.replaceChildren();colors.filter(c=>/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(c)).slice(0,12).forEach(color=>{const b=document.createElement('button');b.type='button';b.className='editor-swatch';b.style.background=color;b.setAttribute('aria-label',color);b.onclick=()=>{input.value=color;sync();emit();};target.append(b);});}
  function emit(){input.dispatchEvent(new Event('input',{bubbles:true}));}
  function draw(){sv.style.backgroundColor=`hsl(${h} 100% 50%)`;sv.firstElementChild.style.left=s+'%';sv.firstElementChild.style.top=(100-v)+'%';box.querySelector('.picker-sample').style.background=input.value;rgb.forEach((el,i)=>el.value=parseInt(input.value.slice(1+i*2,3+i*2),16)||0);}
  function change(){input.value=hsvHex(h,s,v)+(Number(alpha.value)<100?Math.round(Number(alpha.value)*2.55).toString(16).padStart(2,'0'):'');draw();emit();}
  function sync(){if(!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(input.value))return;const [r,g,b]=[1,3,5].map(i=>parseInt(input.value.slice(i,i+2),16)/255);const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;h=d?((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360:h;s=max?d/max*100:0;v=max*100;hue.value=h;alpha.value=input.value.length===9?Math.round(parseInt(input.value.slice(7),16)/255*100):100;draw();}
  function remember(){if(!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(input.value))return;recent=[input.value,...recent.filter(c=>c!==input.value)].slice(0,8);try{localStorage.setItem('portia-colors',JSON.stringify(recent));}catch{}swatches(box.querySelector('[data-recent]'),recent);}
  function pointer(e){const r=sv.getBoundingClientRect();s=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));v=Math.max(0,Math.min(100,100-(e.clientY-r.top)/r.height*100));change();}
  sv.onpointerdown=e=>{sv.setPointerCapture(e.pointerId);pointer(e);};sv.onpointermove=e=>{if(sv.hasPointerCapture(e.pointerId))pointer(e);};sv.onpointerup=remember;
  sv.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();s=Math.max(0,Math.min(100,s+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));v=Math.max(0,Math.min(100,v+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0)));change();};
  hue.oninput=()=>{h=Number(hue.value);change();};alpha.oninput=change;
  rgb.forEach(el=>el.onchange=()=>{const suffix=input.value.length===9?input.value.slice(7):'';input.value='#'+rgb.map(c=>Math.round(Math.max(0,Math.min(255,Number(c.value)||0))).toString(16).padStart(2,'0')).join('')+suffix;sync();emit();remember();});
  input.addEventListener('input',sync);input.addEventListener('change',remember);box.addEventListener('change',remember);box.addEventListener('toggle',()=>{if(box.open)sync();else remember();});
  swatches(box.querySelector('[data-palette]'),palette);swatches(box.querySelector('[data-recent]'),recent);sync();
}
