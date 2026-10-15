import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {competitionHarness} from './helpers/competition-harness.mjs';
import {inspectMaze} from '../js/arena-model.js';

const h=await competitionHarness({visual:true,attemptLimit:true,timedProgression:true});let browser;let checks=0;
const checked=label=>{console.log('PASS '+label);checks++;};
try{
  const uid=randomUUID();await h.owner(async()=>{
    await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[uid,'arena@example.test',JSON.stringify({full_name:'Arena Participant',registration_number:'AR-BROWSER',department:'Computing',semester:2})]);
    await h.db.query("update public.profiles set status='approved' where id=$1",[uid]);
  });
  const admin=(name,args={})=>h.rpc(name,args,h.admin);
  const settings=await admin('admin_arena'),config=structuredClone(settings.config),qs=[];
  for(const title of ['Opening logic','Final logic'])qs.push((await admin('admin_save_puzzle',{p_puzzle_id:null,p_title:title,p_description:'Six times seven?',p_answer:'42',p_points:20,p_status:'published',p_case_sensitive:false})).id);
  config.opening_question_ids=[qs[0]];config.final_question_ids=[qs[1]];config.enabled=true;
  await admin('admin_save_arena',{p_config:config,p_expected_updated_at:settings.updated_at});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({hasTouch:true});await h.fixture(context);
  await context.addInitScript(id=>sessionStorage.setItem('test-user',id),uid);
  const adminContext=await browser.newContext();await h.fixture(adminContext);await adminContext.addInitScript(id=>sessionStorage.setItem('test-user',id),h.admin);const adminPage=await adminContext.newPage();
  await adminPage.goto(h.base+'admin.html#levels');await adminPage.locator('#arena-admin-form').waitFor({state:'visible'});
  await adminPage.locator(`[name=opening_question_ids][value="${qs[0]}"]`).uncheck();await adminPage.getByRole('button',{name:'Save competition settings',exact:true}).click();await adminPage.locator('[data-arena-admin-feedback]').filter({hasText:'Select published opening and final questions'}).waitFor();
  await adminPage.locator(`[name=opening_question_ids][value="${qs[0]}"]`).check();await adminPage.locator('[name=level-2-description]').fill('Build the Tech and Innovative Society logo before the deadline.');await adminPage.getByRole('button',{name:'Save competition settings',exact:true}).click();await adminPage.locator('[data-arena-admin-feedback]').filter({hasText:'Competition open'}).waitFor();checked('admin form rejects empty phases and saves valid challenge instructions');
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(h.base+'student.html');await page.locator('#arena-progress .level-current').waitFor();
  await page.locator('.brand-mark img').waitFor({state:'visible'});assert.ok(await page.locator('.brand-mark img').evaluate(img=>img.complete&&img.naturalWidth>0));assert.equal(await page.locator('link[rel=icon]').getAttribute('href'),'assets/puzzles/tis-logo.jpeg');checked('supplied society logo loads in the header and is configured as the tab icon');
  assert.equal(await page.locator('#arena-progress li').count(),5);assert.equal(await page.locator('#arena-progress .level-locked').count(),4);checked('five-level strip starts yellow with four red locked levels');
  async function answer(title){await page.getByRole('button',{name:'Open '+title,exact:true}).click();await page.locator('#answer').fill('42');await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.locator('#solve-feedback').filter({hasText:'Correct'}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();}
  await answer('Opening logic');await page.locator('#arena-progress li').nth(1).filter({hasText:'Current'}).waitFor();checked('opening questions unlock only the logo jigsaw');
  await page.getByRole('button',{name:'Start level 2',exact:true}).click();assert.equal((await h.rpc('arena_progress',{},uid)).levels[1].state,'current');
  assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from private.arena_attempts'))).rows[0].n,0);
  await page.getByRole('button',{name:'Start timed attempt',exact:true}).click();await page.locator('.jigsaw-tray button:not([disabled])').first().waitFor();checked('viewing instructions does not start a timed attempt');
  await page.locator('.jigsaw-reference img').waitFor();assert.ok(await page.locator('.jigsaw-reference img').evaluate(async img=>{await img.decode();return img.naturalWidth>0&&img.src.endsWith('tis-logo.jpeg');}));assert.equal(await page.getByRole('link',{name:'Open full-size reference',exact:true}).getAttribute('target'),'_blank');checked('logo jigsaw displays the complete reference picture and a full-size link');
  async function place(piece){const tile=page.locator(`.jigsaw-tray [data-piece="${piece}"]`);await tile.click();await page.locator(`.jigsaw-board [data-slot="${piece}"]`).click();await page.waitForFunction(()=>document.querySelector('.jigsaw-board button')?.disabled===false||document.querySelector('.game-clock')?.textContent.includes('Completed'));}
  await page.locator('.jigsaw-tray [data-piece="0"]').focus();await page.keyboard.press('Enter');await page.locator('.jigsaw-board [data-slot="0"]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.jigsaw-board button')?.disabled===false);assert.equal(await page.evaluate(()=>document.activeElement.dataset.slot),'0');checked('keyboard placement retains the focused destination after saving');
  const initial=await h.rpc('arena_start',{p_level:2},uid);await page.reload();await page.getByRole('button',{name:'Start level 2',exact:true}).click();await page.getByRole('button',{name:'Start timed attempt',exact:true}).click();await page.locator('.jigsaw-board [data-slot="0"][data-piece="0"]').waitFor();
  assert.equal((await h.rpc('arena_start',{p_level:2},uid)).expires_at,initial.expires_at);checked('reload restores placement and the original server deadline');
  await page.setViewportSize({width:375,height:650});await page.locator('#game-dialog').evaluate(n=>n.scrollTop=n.scrollHeight);
  const timerBox=await page.locator('.game-clock').boundingBox(),dialogBox=await page.locator('#game-dialog').boundingBox();assert.ok(timerBox.y>=dialogBox.y&&timerBox.y+timerBox.height<=dialogBox.y+dialogBox.height,'remaining time stays visible at the bottom of a scrolling mobile puzzle');
  await page.locator('#game-dialog').evaluate(n=>n.scrollTop=0);await page.setViewportSize({width:1440,height:950});checked('timer remains visible when a mobile puzzle scrolls');
  let delayed=false,lost=false;
  await page.route('**/__test/rpc',async route=>{
    const body=route.request().postDataJSON();
    if(body.name==='arena_move'&&body.args.p_move.piece===1&&!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,2000));}
    if(body.name==='arena_move'&&body.args.p_move.piece===2&&!lost){lost=true;await route.fetch();await route.fulfill({json:{data:null,error:{code:'lost_response',message:'network_error'}}});return;}
    await route.continue();
  });
  await place(1);const live=await h.rpc('arena_start',{p_level:2},uid),clock=await page.locator('.game-clock').textContent(),digits=clock.match(/(\d+):(\d+)/),shown=Number(digits[1])*60+Number(digits[2]);
  assert.ok(Math.abs(shown-Math.ceil((Date.parse(live.expires_at)-Date.parse(live.server_time))/1000))<=1);checked('slow request processing does not subtract elapsed time twice');
  await page.locator('.jigsaw-tray [data-piece="2"]').click();await page.locator('.jigsaw-board [data-slot="2"]').click();await page.locator('#game-dialog .notice').filter({hasText:'Restore saved state'}).waitFor();
  await page.getByRole('button',{name:'Restore saved state',exact:true}).click();await page.locator('.jigsaw-board [data-slot="2"][data-piece="2"]:not([disabled])').waitFor();checked('a lost move response restores the accepted server placement');
  await page.locator('.jigsaw-tray [data-piece="3"]').dragTo(page.locator('.jigsaw-board [data-slot="3"]'));await page.locator('.jigsaw-board [data-slot="3"][data-piece="3"]:not([disabled])').waitFor();checked('desktop drag and drop persists a placement');
  for(let piece=4;piece<16;piece++)await place(piece);await page.locator('.game-clock').filter({hasText:'Completed'}).waitFor();await page.locator('#game-dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#arena-progress li').nth(1).filter({hasText:'Completed'}).waitFor();assert.ok(await page.locator('.arena-level-card').filter({hasText:'Society logo jigsaw'}).getByRole('button').isDisabled());checked('completed logo challenge cannot be opened again');
  await page.setViewportSize({width:375,height:950});
  await page.getByRole('button',{name:'Start level 3',exact:true}).click();await page.getByRole('button',{name:'Start timed attempt',exact:true}).click();await page.locator('.jigsaw-tray button:not([disabled])').first().waitFor();
  const ratio=await page.locator('.jigsaw-board').evaluate(node=>node.clientWidth/node.clientHeight);assert.ok(Math.abs(ratio-1.5)<.03);checked('second jigsaw preserves the supplied landscape image');
  assert.ok(await page.locator('.jigsaw-reference img').evaluate(async img=>{await img.decode();return img.naturalWidth>img.naturalHeight&&img.src.endsWith('robot-workspace.png');}));checked('robot jigsaw displays its complete landscape reference picture');
  await page.locator('.jigsaw-tray [data-piece="0"]').tap();await page.locator('.jigsaw-board [data-slot="0"]').tap();await page.locator('.jigsaw-board [data-slot="0"][data-piece="0"]:not([disabled])').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checked('touch selection places pieces on a mobile board without page overflow');
  for(let piece=1;piece<24;piece++)await place(piece);await page.locator('.game-clock').filter({hasText:'Completed'}).waitFor();await page.locator('#game-dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#arena-progress li').nth(2).filter({hasText:'Completed'}).waitFor();assert.ok(await page.locator('.arena-level-card').filter({hasText:'Robot workspace jigsaw'}).getByRole('button').isDisabled());checked('completed robot challenge cannot be opened again');
  await page.getByRole('button',{name:'Start level 4',exact:true}).click();await page.getByRole('button',{name:'Start timed attempt',exact:true}).click();await page.locator('.maze-canvas').waitFor();
  const maze=inspectMaze(config.levels[3].settings.grid),path=maze.alternativePath;assert.ok(path.length>maze.shortestPath.length);
  await page.locator('.maze-canvas').focus();await page.keyboard.press('ArrowLeft');assert.ok((await page.locator('.maze-position').textContent()).includes('wall'));checked('maze walls block invalid movement');
  for(let i=1;i<path.length;i++){
    const delta=path[i]-path[i-1],direction=delta===1?'right':delta===-1?'left':delta===maze.width?'down':'up';
    await page.locator(`[data-direction="${direction}"]`).click();await page.waitForFunction(()=>!document.querySelector('[data-direction]')?.disabled||document.querySelector('.game-clock')?.textContent.includes('Completed'));
  }
  await page.locator('.game-clock').filter({hasText:'Completed'}).waitFor();await page.locator('#game-dialog').getByRole('button',{name:'Close',exact:true}).click();await answer('Final logic');await page.locator('#arena-progress .level-completed').nth(4).waitFor();checked('a legal longer maze route unlocks final questions and all five levels complete');
  const total=(await h.rpc('student_overview',{},uid)).points;assert.equal(total,440);assert.equal((await h.rpc('public_leaderboard',{p_page:1,p_page_size:20},null)).rows[0].points,total);checked('all level points share the existing trusted leaderboard');
  for(const width of[375,768,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}checked('progress and completed course fit mobile, tablet and desktop');
  await adminPage.getByRole('button',{name:'Refresh settings',exact:true}).click();await adminPage.locator('#arena-admin-form').waitFor({state:'visible'});assert.ok(await adminPage.locator('#arena-admin-form [name="level-2-seconds"]').isDisabled());
  await adminPage.getByRole('button',{name:'Preview level 3',exact:true}).click();await adminPage.locator('#arena-preview-dialog img').waitFor();assert.equal((await h.owner(()=>h.db.query('select count(*)::int n from private.arena_attempts'))).rows[0].n,3);checked('admin settings freeze after participation and previews create no student attempts');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/arena-completed.png',fullPage:true});
  const expiryUid=randomUUID();await h.owner(async()=>{await h.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[expiryUid,'expiry@example.test',JSON.stringify({full_name:'Expiry Student',registration_number:'AR-EXPIRY',department:'Computing',semester:2})]);await h.db.query("update public.profiles set status='approved' where id=$1",[expiryUid]);});
  await h.rpc('submit_answer',{p_puzzle_id:qs[0],p_answer:'42'},expiryUid);await h.rpc('arena_start',{p_level:2},expiryUid);
  const expiryContext=await browser.newContext();await h.fixture(expiryContext);await expiryContext.addInitScript(id=>sessionStorage.setItem('test-user',id),expiryUid);const expiryPage=await expiryContext.newPage();await expiryPage.goto(h.base+'student.html');await expiryPage.getByRole('button',{name:'Start level 2',exact:true}).click();
  await h.owner(()=>h.db.query("update private.arena_attempts set expires_at=clock_timestamp()+interval '2 seconds' where student_id=$1 and level=2",[expiryUid]));
  await expiryPage.getByRole('button',{name:'Start timed attempt',exact:true}).click();await expiryPage.locator('.game-clock').filter({hasText:'Time expired'}).waitFor();assert.equal(await expiryPage.locator('.jigsaw-board button:not([disabled])').count(),0);await expiryPage.locator('#game-dialog').getByRole('button',{name:'Close',exact:true}).click();await expiryPage.locator('#arena-progress .level-expired').waitFor();assert.equal((await h.rpc('arena_start',{p_level:2},expiryUid)).status,'expired');await expiryPage.getByRole('button',{name:'Start level 3',exact:true}).waitFor();checked('countdown expiry ends play without restarting and unlocks the next level');
  for(const level of[3,4]){
    await expiryPage.getByRole('button',{name:`Start level ${level}`,exact:true}).click();await expiryPage.getByRole('button',{name:'Start timed attempt',exact:true}).click();await expiryPage.getByRole('button',{name:'Restore saved state',exact:true}).waitFor();
    await h.owner(()=>h.db.query("update private.arena_attempts set expires_at=clock_timestamp()-interval '1 second' where student_id=$1 and level=$2",[expiryUid,level]));
    await expiryPage.getByRole('button',{name:'Restore saved state',exact:true}).click();await expiryPage.locator('.game-clock').filter({hasText:'Time expired'}).waitFor();await expiryPage.locator('#game-dialog').getByRole('button',{name:'Close',exact:true}).click();
    assert.ok(await expiryPage.getByRole('button',{name:`Expired level ${level}`,exact:true}).isDisabled());
  }
  await expiryPage.getByRole('button',{name:'Open Final logic',exact:true}).click();
  for(const [answer,text]of[['wrong','1 attempt remaining'],['wrong again','0 points']]){await expiryPage.locator('#answer').fill(answer);await expiryPage.getByRole('button',{name:'Submit answer',exact:true}).click();await expiryPage.locator('#solve-feedback').filter({hasText:text}).waitFor();}
  await expiryPage.getByRole('button',{name:'Close',exact:true}).click();await expiryPage.locator('[data-arena-feedback]').filter({hasText:'finished all five levels'}).waitFor();assert.equal((await h.rpc('student_overview',{},expiryUid)).points,20);checked('robot and maze timeouts unlock final questions at zero points and the course can finish');
  assert.deepEqual(errors,[]);checked('integrated course has no browser JavaScript errors');console.log(`${checks} arena browser checks passed.`);
}finally{await browser?.close();await h.close();}
