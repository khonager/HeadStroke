import {test,expect} from '@playwright/test';
test('mobile sketchbook draws, saves, persists, views and deletes',async({page})=>{
  await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page).toHaveTitle('HeadStroke');
  await page.getByRole('button',{name:'Try browser preview'}).click();
  await expect(page.locator('#state')).toHaveText('Paused');
  await page.getByRole('button',{name:'Start drawing',exact:true}).click();
  const box=(await page.locator('#canvas').boundingBox())!;
  await page.mouse.move(box.x+40,box.y+50);await page.mouse.down();
  for(let i=0;i<20;i++){await page.mouse.move(box.x+40+i*10,box.y+50+Math.sin(i/3)*20);await page.waitForTimeout(35);}
  await page.mouse.up();await page.getByRole('button',{name:'Save drawing',exact:true}).click();
  await expect(page.locator('#notice')).toHaveText('Drawing saved');await expect(page.locator('.artwork')).toHaveCount(1);
  await page.getByRole('button',{name:'New canvas',exact:true}).click();
  await page.getByRole('button',{name:'View Drawing 1'}).click();await expect(page.locator('#state')).toHaveText('Viewing Drawing 1');
  await page.getByRole('button',{name:'Back to drawing'}).click();
  await page.locator('#sensitivity').fill('2');await expect(page.locator('#sensitivity-value')).toHaveText('2.0×');
  await page.reload();await page.getByRole('button',{name:'Try browser preview'}).click();
  await expect(page.locator('.artwork')).toHaveCount(1);await expect(page.locator('#sensitivity-value')).toHaveText('2.0×');
  await page.getByRole('button',{name:'Delete Drawing 1'}).click();await page.getByRole('button',{name:'Keep drawing'}).click();await expect(page.locator('.artwork')).toHaveCount(1);
  await page.getByRole('button',{name:'Delete Drawing 1'}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('.artwork')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('desktop connection state is honest and readable',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await page.goto('/');
  await expect(page.getByRole('heading',{name:'HeadStroke'})).toBeVisible();
  await expect(page.locator('#connection')).toHaveText('Waiting for Even G2');
  await expect(page.getByRole('button',{name:'Start drawing',exact:true})).toBeDisabled();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('official SDK connects to a native host and handles calibrated IMU and tap events',async({page})=>{
  await page.addInitScript(()=>{
    const w=window as unknown as {__calls:Record<string,unknown>[];flutter_inappwebview:unknown};
    w.__calls=[];
    // QR testing uses HTTP over LAN, where randomUUID is not available.
    Object.defineProperty(crypto, 'randomUUID', {value:undefined});
    w.flutter_inappwebview={callHandler:async(_handler:string,raw:string)=>{
      const call=JSON.parse(raw);w.__calls.push(call);
      if(call.method==='createStartUpPageContainer')return 0;
      if(call.method==='getLocalStorage')return '';
      if(call.method==='updateImageRawData')return 'success';
      return true;
    }};
  });
  await page.goto('/');await expect(page.locator('#state')).toHaveText('Calibration');
  async function pose(v:number[]){
    await page.evaluate(async v=>{
      for(let i=0;i<8;i++){
        window.dispatchEvent(new CustomEvent('evenHubEvent',{detail:{sysEvent:{eventType:8,imuData:{x:v[0],y:v[1],z:v[2]}}}}));
        await new Promise(r=>setTimeout(r,100));
      }
    },v);
  }
  for(const v of [[0,0,1],[1,0,1],[0,1,1]]){await pose(v);await page.locator('#capture').click();}
  await expect(page.locator('#state')).toHaveText('Paused');
  await pose([0,0,1]);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('evenHubEvent',{detail:{textEvent:{}}})));
  await expect(page.locator('#state')).toHaveText('Drawing');
  await pose([.4,.2,1]);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('evenHubEvent',{detail:{textEvent:{eventType:0}}})));
  await expect(page.locator('#state')).toHaveText('Paused');
  await page.getByRole('button',{name:'Save drawing',exact:true}).click();await expect(page.locator('.artwork')).toHaveCount(1);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('evenHubEvent',{detail:{sysEvent:{eventType:3}}})));
  const calls=await page.evaluate(()=>(window as unknown as {__calls:any[]}).__calls);
  const pages=calls.filter(c=>c.method==='createStartUpPageContainer');expect(pages).toHaveLength(1);
  expect(pages[0].data.textObject.filter((c:any)=>c.isEventCapture===1)).toHaveLength(1);
  expect(calls.some(c=>c.method==='imuControl')).toBe(true);
  expect(calls.some(c=>c.method==='updateImageRawData'&&Array.isArray(c.data.imageData)&&c.data.imageData.length>0)).toBe(true);
  expect(calls.some(c=>c.method==='shutDownPageContainer')).toBe(true);
  await expect(page.getByRole('button',{name:'Try browser preview'})).toBeHidden();
});
