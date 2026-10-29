import './style.css';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { Glasses } from './glasses';
import { Studio } from './controller';
import { browserStorage } from './storage';
import { paint, decodePixels, WIDTH, HEIGHT } from './drawing';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
<header><h1>HeadStroke</h1><a href="#sketchbook">Sketchbook</a></header>
<canvas id="canvas" width="200" height="100" aria-label="Drawing preview"></canvas>
<p id="state" class="state">Paused</p>
<div id="notice" role="status" aria-live="polite" hidden></div>
<section id="calibration" hidden aria-label="Head movement calibration"><h2>Set up head movement</h2><p id="instruction"></p><p id="calibration-sensor" class="hint" role="status"></p><button id="capture">Capture position</button><p class="hint">Use your normal drawing posture at position 1. Tilt right for position 2; a sideways turn may not register. Pitch your chin upward for position 3. You can tap on the glasses or use the phone button.</p></section>
<div class="controls"><button id="toggle" class="primary" disabled>Start drawing</button><button id="recenter" disabled>Recenter</button></div>
<div class="controls secondary"><button id="save" disabled>Save drawing</button><button id="new" disabled>New canvas</button></div>
<section class="settings"><label for="sensitivity">Sensitivity <output id="sensitivity-value">1.0×</output></label><input id="sensitivity" type="range" min="0.25" max="3" step="0.05" value="1" disabled><p class="hint">Before drawing, move your head while paused to check the cursor. Face forward and swipe up to center it. Tap once to draw or pause; move slowly to shade.</p><button id="calibrate" disabled>Redo head calibration</button><details id="help"><summary>Controls & calibration</summary><p>On glasses: tap to pause or resume, swipe up to recenter, swipe down for the menu. Double tap opens the system exit dialog.</p><p>Recenter and sensitivity changes pause drawing. New canvas saves your current marks first.</p><p>Drawings stay on this phone in the Even app. Removing app data can erase them. No account or extra app needed.</p><a href="./privacy.html">Privacy</a></details></section>
<section id="sketchbook"><h2>Saved drawings <span id="count"></span></h2><div id="gallery"><p class="empty">Your drawings will appear here.</p></div></section>
<footer><p id="connection" role="status">Waiting for Even G2</p><div id="preview-help" hidden><p>Open this app from Even Hub to draw with your head.</p><button id="preview">Try browser preview</button></div></footer>
<dialog id="delete-dialog"><h2>Delete this drawing?</h2><p>This removes the saved copy from your sketchbook.</p><div class="controls"><button id="cancel-delete">Keep drawing</button><button id="confirm-delete" class="primary">Delete</button></div></dialog>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('canvas');
paint(canvas,new Float32Array(WIDTH*HEIGHT),{x:100,y:50});
let studio: Studio | undefined;
let connecting = false;
let gallerySignature = '';
let deleting: string | undefined;

function render() {
  const s = studio;
  if (!s) return;
  const frame = s.frame(); paint(canvas,frame.pixels,frame.cursor);
  el('state').textContent = s.viewing ? `Viewing ${s.viewing.title}` : s.calibrationStep >= 0 ? 'Calibration' : s.drawing.paused ? 'Paused' : 'Drawing';
  el('notice').textContent = s.message; el('notice').hidden = !s.message;
  el('connection').textContent = s.connection;
  el('calibration').hidden = s.calibrationStep < 0;
  el('instruction').textContent = `${s.calibrationStep+1}/3 · ${s.calibrationPrompt}`;
  el('calibration-sensor').textContent = s.calibrationSensorStatus;
  const toggle = el<HTMLButtonElement>('toggle');
  toggle.textContent = s.viewing ? 'Back to drawing' : s.calibrationStep >= 0 ? 'Capture position' : s.drawing.paused ? 'Start drawing' : 'Pause drawing';
  for (const id of ['toggle','recenter','save','new','sensitivity','calibrate','capture'])
    (el(id) as HTMLButtonElement | HTMLInputElement).disabled = !s.ready || s.busy;
  for (const id of ['save','new','recenter','sensitivity'])
    (el(id) as HTMLButtonElement | HTMLInputElement).disabled ||= s.calibrationStep >= 0 || !!s.viewing;
  el<HTMLButtonElement>('calibrate').disabled ||= s.demo;
  el<HTMLInputElement>('sensitivity').value = String(s.motion.sensitivity);
  el('sensitivity-value').textContent = `${s.motion.sensitivity.toFixed(2).replace(/0$/,'')}×`;
  el('count').textContent = s.artworks.length ? `${s.artworks.length}/50` : '';
  const signature = s.artworks.map(a=>a.id).join(',');
  if (signature !== gallerySignature) {
    gallerySignature = signature;
    const gallery = el('gallery'); gallery.replaceChildren();
    if (!s.artworks.length) { const p=document.createElement('p');p.className='empty';p.textContent='Your drawings will appear here.';gallery.append(p); }
    for (const artwork of s.artworks) {
      const row=document.createElement('article'); row.className='artwork';
      const open=document.createElement('button'); open.className='open-art'; open.setAttribute('aria-label',`View ${artwork.title}`);
      const thumb=document.createElement('canvas'); paint(thumb,decodePixels(artwork.pixels));
      const text=document.createElement('span'), title=document.createElement('strong'), date=document.createElement('small');
      title.textContent=artwork.title;date.textContent=new Date(artwork.created).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
      text.append(title,date);open.append(thumb,text);open.onclick=()=>void s.action(()=>s.view(artwork));
      const remove=document.createElement('button');remove.className='delete';remove.textContent='Delete';remove.setAttribute('aria-label',`Delete ${artwork.title}`);
      remove.onclick=()=>{deleting=artwork.id;el<HTMLDialogElement>('delete-dialog').showModal();};
      row.append(open,remove);gallery.append(row);
    }
  }
}
async function start(demo: boolean, glasses?: Glasses) {
  if (studio || connecting) return;
  connecting = true;
  el('preview-help').hidden = true;
  studio = new Studio(glasses ?? browserStorage, demo,render,glasses);
  try { await studio.start(); }
  catch(e) { studio.fail(e); studio.connection = 'Could not start · close and reopen HeadStroke'; render(); }
  finally { connecting = false; }
}
function action(callback: (studio: Studio) => void | Promise<void>) {
  if (studio) void studio.action(()=>callback(studio!));
}
el('toggle').onclick=()=>action(s=>s.toggle());
el('recenter').onclick=()=>action(s=>s.recenter());
el('save').onclick=()=>action(s=>s.saveDrawing());
el('new').onclick=()=>action(s=>s.newCanvas());
el('capture').onclick=()=>action(s=>s.captureCalibration());
el('calibrate').onclick=()=>action(s=>s.beginCalibration());
el<HTMLInputElement>('sensitivity').oninput=e=>{const value=Number((e.target as HTMLInputElement).value);action(s=>s.setSensitivity(value));};
el('preview').onclick=()=>void start(true);
el('cancel-delete').onclick=()=>el<HTMLDialogElement>('delete-dialog').close();
el('confirm-delete').onclick=()=>{el<HTMLDialogElement>('delete-dialog').close();if(deleting)action(s=>s.deleteDrawing(deleting!));};

let dragging = false;
function pointer(e: PointerEvent) {
  if (!studio?.demo || !dragging) return;
  const rect=canvas.getBoundingClientRect();
  studio.pointer({x:(e.clientX-rect.left)/rect.width*WIDTH,y:(e.clientY-rect.top)/rect.height*HEIGHT},Date.now());
}
canvas.onpointerdown=e=>{ if(!studio?.demo)return; dragging=true;canvas.setPointerCapture(e.pointerId);studio.drawing.breakStroke();pointer(e); };
canvas.onpointermove=pointer;
canvas.onpointerup=canvas.onpointercancel=()=>{dragging=false;studio?.drawing.breakStroke();};
window.addEventListener('pagehide',()=>{void studio?.persist(true).catch(()=>{});});

// The SDK creates its singleton even outside Even. Check the native host before
// choosing real storage: do not silently treat the SDK's no-host fallback as G2.
const hasNativeHost = () => typeof (window as unknown as {flutter_inappwebview?:{callHandler?:unknown}}).flutter_inappwebview?.callHandler === 'function';
async function connect() {
  if (!hasNativeHost() || studio || connecting) return;
  try {
    const bridge = await waitForEvenAppBridge();
    if (studio || connecting) return;
    await start(false,new Glasses(bridge,error=>studio?.fail(error)));
  } catch(e) { el('connection').textContent = `Connection failed: ${String(e)}`; }
}
window.addEventListener('flutterInAppWebViewPlatformReady',()=>void connect());
void connect();
const connectionPoll = setInterval(()=>{if(studio)clearInterval(connectionPoll);else void connect();},500);
setTimeout(()=>{if(!studio&&!hasNativeHost())el('preview-help').hidden=false;},1500);
