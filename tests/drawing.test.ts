import { describe, it, expect } from 'vitest';
import { Drawing, WIDTH, decodePixels } from '../src/drawing';
import { calibrationFrom, Motion, sampleVector } from '../src/motion';
function stroke(duration: number, passes = 1) {
  const d = new Drawing(); d.setPaused(false);
  for(let pass=0;pass<passes;pass++) {
    d.breakStroke();
    for(let i=0;i<=20;i++) d.move({x:20+i*3,y:50},pass*2000+duration*i/20);
  }
  return d;
}
describe('exposure brush',()=>{
  it('repeated passes brighten the same spot',()=>{
    expect(stroke(1000,2).pixels[50*WIDTH+50]).toBeCloseTo(stroke(1000).pixels[50*WIDTH+50]*2);
  });
  it('fast travel deposits less ink',()=>{
    expect(stroke(200).pixels[50*WIDTH+50]).toBeLessThan(stroke(1000).pixels[50*WIDTH+50]/3);
  });
  it('does not join across pause, resume or dropped samples',()=>{
    const d=new Drawing();d.setPaused(false);d.move({x:10,y:50},0);d.move({x:11,y:50},100);
    d.setPaused(true);d.move({x:100,y:50},200);d.setPaused(false);d.move({x:120,y:50},300);
    d.move({x:150,y:50},3000);expect(d.pixels[50*WIDTH+60]).toBe(0);expect(d.pixels[50*WIDTH+135]).toBe(0);
  });
  it('accumulates at rest, saturates and rejects invalid coordinates',()=>{
    const d=new Drawing();d.setPaused(false);for(let i=0;i<100;i++)d.move({x:50,y:50},i*100);
    expect(d.pixels[50*WIDTH+50]).toBe(255);d.move({x:NaN,y:0},11000);expect(d.cursor.x).toBe(50);
  });
  it('does not store cursor pixels and round trips a saved drawing',()=>{
    const d=stroke(1000),copy=new Drawing();copy.load(d.encode());
    expect(copy.pixels[50*WIDTH+50]).toBe(Math.round(d.pixels[50*WIDTH+50]));
    const empty=new Drawing();expect(decodePixels(empty.encode()).every(v=>v===0)).toBe(true);
  });
});
describe('motion calibration',()=>{
  it('learns oblique axes without presuming units and sensitivity expands travel',()=>{
    const m=new Motion();m.calibration=calibrationFrom([1,2,3],[3,3,3],[1,3,5]);m.recenter([1,2,3]);
    expect(m.project([3,3,3])!.x).toBeCloseTo(184);m.recenter([1,2,3]);
    expect(m.project([1,3,5])!.y).toBeCloseTo(8);
    m.sensitivity=2;m.recenter([1,2,3]);expect(m.project([3,3,3])!.x).toBe(199);
  });
  it('rejects absent motion, collinear movements and nonfinite samples',()=>{
    expect(()=>calibrationFrom([0,0,0],[0,0,0],[1,0,0])).toThrow();
    expect(()=>calibrationFrom([0,0,0],[1,0,0],[2,0,0])).toThrow();
    expect(sampleVector({x:Infinity})).toBeUndefined();expect(sampleVector({})).toEqual([0,0,0]);
  });
});
