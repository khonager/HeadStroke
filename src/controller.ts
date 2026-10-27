import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { Drawing, decodePixels, clamp, type Point } from './drawing';
import { Motion, calibrationFrom, sampleVector, type Vector } from './motion';
import { Repository, type Artwork, type Snapshot, type StoragePort } from './storage';
import { inputType, type GlassesPort, type Frame } from './glasses';

export class Studio {
  drawing = new Drawing();
  motion = new Motion();
  artworks: Artwork[] = [];
  viewing?: Artwork;
  ready = false;
  busy = false;
  message = '';
  connection = 'Waiting for head movement';
  calibrationStep: -1 | 0 | 1 | 2 = -1;
  menuIndex = -1;
  galleryIndex = -1;
  readonly menu = ['Back to drawing', 'Save drawing', 'New canvas', 'Saved drawings', 'Sensitivity +', 'Sensitivity -', 'Calibrate', 'Exit'];
  private samples: {v: Vector; t: number}[] = [];
  private captures: Vector[] = [];
  private latest?: Vector;
  private lastSample = 0;
  private repository: Repository;
  private savedState = '';
  private persistRunning = false;
  private timer?: ReturnType<typeof setInterval>;
  private frameTimer?: ReturnType<typeof setInterval>;
  private frameDirty = true;
  private stopped = false;
  constructor(storage: StoragePort, public readonly demo: boolean, private changed: () => void, private glasses?: GlassesPort) {
    this.repository = new Repository(storage);
  }
  async start() {
    await this.glasses?.start(event => { void this.event(event).catch(e => this.fail(e)); });
    this.frameTimer = setInterval(() => {
      if (this.frameDirty) { this.glasses?.render(this.frame()); this.frameDirty = false; }
    }, 120);
    // On invalid/unreadable storage, leave original bytes intact and block writes.
    const saved = await this.repository.load();
    if (saved) {
      this.artworks = saved.artworks; this.drawing.load(saved.draft);
      this.motion.sensitivity = saved.sensitivity; this.motion.calibration = saved.calibration;
    }
    this.ready = true;
    this.savedState = JSON.stringify(this.snapshot());
    if (this.demo) {
      this.connection = 'Browser preview · drag on the canvas';
    } else {
      if (!this.motion.calibration) this.beginCalibration();
      await this.glasses?.imu(true);
    }
    this.timer = setInterval(() => {
      if (!this.demo && this.lastSample && Date.now() - this.lastSample > 1800) {
        this.drawing.setPaused(true); this.connection = 'Head tracking interrupted · reopen if it does not recover';
        this.notify();
      }
      void this.persist().catch(e => this.fail(e));
    }, 1500);

    this.notify();
  }
  fail(error: unknown) {
    this.message = error instanceof Error ? error.message : String(error);
    this.drawing.setPaused(true); this.notify();
  }
  private notify() { this.frameDirty = true; this.changed(); }
  private snapshot(): Snapshot {
    return {version:1, sensitivity:this.motion.sensitivity, calibration:this.motion.calibration,
      draft:this.drawing.encode(), artworks:this.artworks};
  }
  async persist(force = false) {
    if (!this.ready || (this.persistRunning && !force)) return;
    const snapshot = this.snapshot(), serialized = JSON.stringify(snapshot);
    if (!force && serialized === this.savedState) return;
    this.persistRunning = true;
    try { await this.repository.save(snapshot); this.savedState = serialized; }
    finally { this.persistRunning = false; }
  }
  async action(action: () => void | Promise<void>) {
    if (!this.ready || this.busy || this.stopped) return;
    this.busy = true; this.message = ''; this.notify();
    try { await action(); } catch (e) { this.fail(e); }
    finally { this.busy = false; this.notify(); }
  }
  toggle() {
    if (this.viewing) { this.closeView(); return; }
    if (this.calibrationStep >= 0) { this.captureCalibration(); return; }
    if (!this.demo && (!this.motion.calibration || Date.now() - this.lastSample > 1500))
      throw new Error('Wait for head tracking and complete calibration first.');
    this.drawing.setPaused(!this.drawing.paused);
    if (this.drawing.paused) void this.persist(true).catch(e => this.fail(e));
    this.notify();
  }
  recenter() {
    this.drawing.setPaused(true); this.motion.recenter(this.latest);
    this.drawing.cursor = {x:100,y:50}; this.message = 'Centered · tap to draw'; this.notify();
  }
  setSensitivity(value: number) {
    this.motion.sensitivity = Math.round(clamp(value,.25,3)*100)/100;
    this.drawing.setPaused(true); this.drawing.breakStroke(); this.notify();
    void this.persist().catch(e => this.fail(e));
  }
  beginCalibration() {
    this.drawing.setPaused(true); this.viewing = undefined; this.menuIndex = -1;
    this.calibrationStep = 0; this.captures = []; this.message = ''; this.notify();
  }
  get calibrationPrompt() {
    return ['Look straight ahead. Hold still, then tap.',
      'Turn or tilt comfortably right. Hold, then tap.',
      'Return to center, look up. Hold, then tap.'][this.calibrationStep] ?? '';
  }
  captureCalibration() {
    const recent = this.samples.filter(s => Date.now() - s.t < 700);
    if (recent.length < 3 || Date.now() - this.lastSample > 500) throw new Error('Hold still and wait for a few head-tracking samples, then tap.');
    const mean = [0,1,2].map(i => recent.reduce((sum,s) => sum + s.v[i],0)/recent.length) as Vector;
    const noise = Math.max(...recent.map(s => Math.hypot(...s.v.map((v,i) => v - mean[i]))));
    if (this.calibrationStep > 0) {
      const delta = Math.hypot(...mean.map((v,i) => v - this.captures[0][i]));
      if (delta < Math.max(1e-4,noise * 5)) throw new Error('Movement is too small or not steady. Hold a clear tilt, then tap again.');
    }
    this.captures[this.calibrationStep] = mean;
    if (this.calibrationStep === 2) {
      try { this.motion.calibration = calibrationFrom(this.captures[0],this.captures[1],mean); }
      catch(e) { this.calibrationStep = 0; this.captures = []; throw e; }
      this.motion.recenter(this.captures[0]); this.calibrationStep = -1;
      this.message = 'Ready · face forward and tap to draw';
      void this.persist(true).catch(e => this.fail(e));
    } else this.calibrationStep = (this.calibrationStep + 1) as 1 | 2;
    this.samples = []; this.notify();
  }
  sample(vector: Vector, time = Date.now()) {
    if (!this.ready || this.stopped) return;
    const gap = time - this.lastSample;
    if (gap > 1500 && this.lastSample) { this.drawing.setPaused(true); this.motion.recenter(vector); }
    this.lastSample = time; this.latest = vector;
    this.samples.push({v:vector,t:time}); this.samples = this.samples.filter(s => time - s.t < 700);
    this.connection = 'Even G2 · head tracking active';
    if (this.calibrationStep < 0 && this.menuIndex < 0 && !this.viewing && this.galleryIndex < 0) {
      const point = this.motion.project(vector);
      if (point) this.drawing.move(point,time);
    }
    this.notify();
  }
  pointer(point: Point, time: number) {
    if (this.demo && this.ready && !this.viewing) { this.drawing.move(point,time); this.notify(); }
  }
  async saveDrawing() {
    this.drawing.setPaused(true);
    if (!this.drawing.hasMarks) throw new Error('Make a few marks before saving.');
    if (this.artworks.length >= 50) throw new Error('Sketchbook is full (50 drawings). Delete a drawing in the phone view first.');
    const previous = this.artworks;
    const artwork: Artwork = {id:Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''), title:`Drawing ${this.artworks.length + 1}`,
      created:new Date().toISOString(), pixels:this.drawing.encode()};
    this.artworks = [artwork,...previous];
    try { await this.persist(true); } catch(e) { this.artworks = previous; throw e; }
    this.message = 'Drawing saved'; this.notify();
  }
  async newCanvas() {
    if (this.drawing.hasMarks && !this.artworks.some(a => a.pixels === this.drawing.encode())) await this.saveDrawing();
    const draft = this.drawing.encode();
    this.drawing.clear(); this.closeView(); this.recenter();
    try { await this.persist(true); } catch(e) { this.drawing.load(draft); throw e; }
    this.message = 'New canvas · previous marks kept in Saved drawings'; this.notify();
  }
  view(artwork: Artwork) { this.drawing.setPaused(true); this.viewing = artwork; this.galleryIndex = this.artworks.findIndex(a => a.id === artwork.id); this.menuIndex = -1; this.message = ''; this.notify(); }
  closeView() { this.viewing = undefined; this.galleryIndex = -1; this.drawing.breakStroke(); this.notify(); }
  async deleteDrawing(id: string) {
    const previous = this.artworks; this.artworks = previous.filter(a => a.id !== id);
    try { await this.persist(true); } catch(e) { this.artworks = previous; throw e; }
    if (this.viewing?.id === id) this.closeView(); this.message = 'Drawing deleted'; this.notify();
  }
  private async event(event: EvenHubEvent) {
    if (event.sysEvent?.imuData) {
      const vector = sampleVector(event.sysEvent.imuData);
      if (vector) this.sample(vector);
      return;
    }
    const type = inputType(event);
    if (type === OsEventTypeList.SYSTEM_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      this.drawing.setPaused(true); void this.persist(true).catch(() => {}); this.stop(); return;
    }
    if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      this.drawing.setPaused(true); this.motion.recenter(); this.samples = []; this.lastSample = 0;
      await this.glasses?.imu(true); this.notify(); return;
    }
    if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      this.drawing.setPaused(true); await this.persist(true); await this.glasses?.imu(false); this.notify(); return;
    }
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      this.drawing.setPaused(true);
      // Exit must remain usable even if saving fails or loading failed.
      await this.persist(true).catch(e => this.fail(e)); await this.glasses?.exit(); this.notify(); return;
    }
    await this.action(async () => {
      if (type === OsEventTypeList.CLICK_EVENT) {
        if (this.menuIndex >= 0) await this.selectMenu();
        else if (this.galleryIndex >= 0 && !this.viewing) this.view(this.artworks[this.galleryIndex]);
        else this.toggle();
      } else if (type === OsEventTypeList.SCROLL_TOP_EVENT || type === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        const direction = type === OsEventTypeList.SCROLL_TOP_EVENT ? -1 : 1;
        if (this.menuIndex >= 0) this.menuIndex = (this.menuIndex + direction + this.menu.length) % this.menu.length;
        else if (this.viewing || this.galleryIndex >= 0) {
          this.galleryIndex = (Math.max(0,this.galleryIndex) + direction + this.artworks.length) % this.artworks.length;
          this.viewing = this.artworks[this.galleryIndex];
        } else if (this.calibrationStep >= 0) { /* Calibration taps are deliberately explicit. */ }
        else if (direction < 0) this.recenter();
        else { this.drawing.setPaused(true); this.menuIndex = 0; }
      }
    });
  }
  private async selectMenu() {
    const index = this.menuIndex;
    if (index === 0) this.menuIndex = -1;
    if (index === 1) { await this.saveDrawing(); this.menuIndex = -1; }
    if (index === 2) { await this.newCanvas(); this.menuIndex = -1; }
    if (index === 3) {
      if (!this.artworks.length) throw new Error('No saved drawings yet.');
      this.galleryIndex = 0; this.view(this.artworks[0]);
    }
    if (index === 4 || index === 5) { this.setSensitivity(this.motion.sensitivity + (index === 4 ? .25 : -.25)); this.message = `Sensitivity ${this.motion.sensitivity.toFixed(2)}x`; }
    if (index === 6) this.beginCalibration();
    if (index === 7) { await this.persist(true); await this.glasses?.exit(); }
  }
  frame(): Frame {
    let text = this.drawing.paused ? 'Paused · tap to draw' : 'Drawing · tap to pause';
    text += '\nSwipe down: menu · swipe up: recenter\nDouble tap: exit';
    if (!this.ready) text = 'Open HeadStroke in the Even app.\nLoading sketchbook...';
    if (this.calibrationStep >= 0) text = `Calibrate ${this.calibrationStep + 1}/3\n${this.calibrationPrompt}\nDouble tap: exit`;
    if (this.menuIndex >= 0) text = `Menu ${this.menuIndex + 1}/${this.menu.length} · swipe to choose\n> ${this.menu[this.menuIndex]}\nTap: select · double tap: exit`;
    if (this.viewing) text = `${this.viewing.title}\nSwipe: other drawings · tap: back\nDouble tap: exit`;
    if (this.message) text = this.message + '\n' + text;
    return {text, pixels:this.viewing ? decodePixels(this.viewing.pixels) : this.drawing.pixels,
      cursor:this.viewing || this.menuIndex >= 0 || this.calibrationStep >= 0 ? undefined : this.drawing.cursor};
  }
  stop() { this.stopped = true; this.drawing.setPaused(true); clearInterval(this.timer); clearInterval(this.frameTimer); this.glasses?.stop(); }
}
