import { it, expect, vi, afterEach } from 'vitest';
import { inputType, LatestSender, type GlassesPort } from '../src/glasses';
import { OsEventTypeList as E, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { Studio } from '../src/controller';
import { Repository, parseSnapshot, type Snapshot, STORAGE_KEY } from '../src/storage';
import { Drawing } from '../src/drawing';
const studios:Studio[]=[];
afterEach(()=>{studios.forEach(s=>s.stop());studios.length=0;vi.useRealTimers();});
function mock() {
  const data=new Map<string,string>();let handler:(e:EvenHubEvent)=>void=()=>{};
  const port:GlassesPort={start:async h=>{handler=h;},render:vi.fn(),imu:vi.fn(async()=>{}),exit:vi.fn(async()=>{}),stop:vi.fn(),
    getLocalStorage:async key=>data.get(key)??'',setLocalStorage:vi.fn(async(k,v)=>{data.set(k,v);return true;})};
  return {port,data,emit:(e:EvenHubEvent)=>handler(e)};
}
it('only treats an existing touch envelope with omitted zero as a tap',()=>{
  expect(inputType({} as EvenHubEvent)).toBeUndefined();
  expect(inputType({sysEvent:{imuData:{x:1}}} as EvenHubEvent)).toBeUndefined();
  expect(inputType({textEvent:{}} as EvenHubEvent)).toBe(E.CLICK_EVENT);
  expect(inputType({sysEvent:{eventType:E.DOUBLE_CLICK_EVENT},textEvent:{}} as EvenHubEvent)).toBe(E.DOUBLE_CLICK_EVENT);
});
it('coalesces image traffic without overlapping sends or retaining old frames',async()=>{
  const sent:number[]=[];let release!:()=>void;
  const queue=new LatestSender<number>(async n=>{sent.push(n);if(n===1)await new Promise<void>(r=>release=r);},()=>{});
  queue.push(1);queue.push(2);queue.push(3);expect(sent).toEqual([1]);release();await new Promise(r=>setTimeout(r,0));
  expect(sent).toEqual([1,3]);queue.close();queue.push(4);expect(sent).toEqual([1,3]);
});
it('save, clear, view, restart and delete preserve the draft and sketchbook',async()=>{
  const m=mock(),s=new Studio(m.port,true,()=>{});studios.push(s);await s.start();s.toggle();
  s.pointer({x:20,y:20},0);s.pointer({x:40,y:20},300);await s.saveDrawing();const encoded=s.drawing.encode();
  await s.newCanvas();expect(s.artworks).toHaveLength(1);expect(s.drawing.hasMarks).toBe(false);
  s.view(s.artworks[0]);expect(s.frame().pixels.some(v=>v>0)).toBe(true);s.closeView();expect(s.drawing.hasMarks).toBe(false);
  const restored=new Studio(m.port,true,()=>{});studios.push(restored);await restored.start();
  expect(restored.artworks[0].pixels).toBe(encoded);expect(restored.drawing.paused).toBe(true);
  await restored.deleteDrawing(restored.artworks[0].id);expect(restored.artworks).toHaveLength(0);
});
it('storage failure is surfaced and never falsely reports a saved drawing',async()=>{
  const m=mock(),s=new Studio(m.port,true,()=>{});studios.push(s);await s.start();s.toggle();s.pointer({x:20,y:20},0);s.pointer({x:30,y:20},100);
  m.port.setLocalStorage=async()=>false; // Repository references the same port.
  await expect(s.saveDrawing()).rejects.toThrow('Storage refused');expect(s.artworks).toHaveLength(0);
  expect(s.drawing.hasMarks).toBe(true);
});
it('invalid stored data blocks overwriting the sketchbook',async()=>{
  const m=mock();m.data.set(STORAGE_KEY,'{broken');const s=new Studio(m.port,true,()=>{});studios.push(s);
  await expect(s.start()).rejects.toThrow();await s.persist(true);expect(m.data.get(STORAGE_KEY)).toBe('{broken');expect(s.ready).toBe(false);
});
it('serializes old and new snapshots, rejecting corrupt dimensions',async()=>{
  const m=mock(),repo=new Repository(m.port);const base:Snapshot={version:1,sensitivity:1,draft:new Drawing().encode(),artworks:[]};
  await Promise.all([repo.save(base),repo.save({...base,sensitivity:2})]);expect((await repo.load())!.sensitivity).toBe(2);
  // A previously saved, weak calibration must remain loadable so it can be redone.
  expect(parseSnapshot(JSON.stringify({...base,calibration:{right:[1,0,0],up:[1,.3,0]}})).calibration).toBeDefined();
  expect(()=>parseSnapshot(JSON.stringify({...base,draft:'AA=='}))).toThrow();
});
it('real-mode calibration, taps, menu, stale stream and system exit work',async()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const m=mock(),s=new Studio(m.port,false,()=>{},m.port);studios.push(s);await s.start();
  const pose=async(v:[number,number,number])=>{for(let i=0;i<8;i++){s.sample(v);await vi.advanceTimersByTimeAsync(100);}};
  for(const v of [[0,0,1],[1,0,1],[0,1,1]] as [number,number,number][]){await pose(v);s.captureCalibration();}
  expect(s.calibrationStep).toBe(-1);await pose([0,0,1]);m.emit({textEvent:{}} as EvenHubEvent);
  await vi.advanceTimersByTimeAsync(0);expect(s.drawing.paused).toBe(false);
  expect(s.frame().text).toBe(' ');
  await pose([.3,.2,1]);expect(s.drawing.hasMarks).toBe(true);
  m.emit({sysEvent:{eventType:E.SCROLL_BOTTOM_EVENT}} as EvenHubEvent);await vi.advanceTimersByTimeAsync(0);
  expect(s.menuIndex).toBe(0);expect(s.drawing.paused).toBe(true);
  m.emit({sysEvent:{eventType:E.DOUBLE_CLICK_EVENT}} as EvenHubEvent);await vi.advanceTimersByTimeAsync(0);expect(m.port.exit).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3500);expect(s.drawing.paused).toBe(true);expect(s.connection).toContain('interrupted');
});
it('calibration accepts sparse but recent G2 samples and rejects a stopped stream',async()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const m=mock(),s=new Studio(m.port,false,()=>{},m.port);studios.push(s);await s.start();
  s.sample([0,0,1]);s.captureCalibration();expect(s.calibrationStep).toBe(1);
  s.sample([.5,0,1]);await vi.advanceTimersByTimeAsync(800);
  expect(s.calibrationSensorStatus).toContain('1 new sample');
  s.captureCalibration();expect(s.calibrationStep).toBe(2);
  await vi.advanceTimersByTimeAsync(1600);
  expect(()=>s.captureCalibration()).toThrow('No recent head-tracking sample');
  expect(m.port.imu).toHaveBeenCalledTimes(2);
  s.sample([0,.5,1]);s.captureCalibration();expect(s.calibrationStep).toBe(-1);
});
it('calibration rejects an unhelpfully small tilt without losing the current step',async()=>{
  vi.useFakeTimers();vi.setSystemTime(100000);
  const m=mock(),s=new Studio(m.port,false,()=>{},m.port);studios.push(s);await s.start();
  s.sample([0,0,1]);s.captureCalibration();
  s.sample([.01,0,1]);
  expect(()=>s.captureCalibration()).toThrow('Tilt your right ear farther');
  expect(s.calibrationStep).toBe(1);
  s.sample([.2,0,1]);
  await vi.advanceTimersByTimeAsync(1200);
  s.sample([.2,0,1]);s.captureCalibration();expect(s.calibrationStep).toBe(2);
});
