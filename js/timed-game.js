import {element,busy} from './common.js';
import {errorNotice} from './admin-ui.js';
import {remainingSeconds,arenaError} from './arena-model.js';
import {jigsawGame} from './jigsaw-game.js';
import {mazeGame} from './maze-game.js';

export function timedGame(service,{onChanged,onAccessDenied}) {
  const dialog=element('dialog',undefined,'admin-dialog game-dialog');dialog.id='game-dialog';dialog.setAttribute('aria-labelledby','game-title');
  const eyebrow=element('p',undefined,'eyebrow'),title=element('h2');title.id='game-title';
  const timer=element('p',undefined,'game-clock');timer.setAttribute('aria-label','Time remaining');
  const feedback=element('div',undefined,'notice');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.hidden=true;
  const surface=element('div',undefined,'game-surface'),actions=element('div',undefined,'dialog-actions');
  const close=element('button','Close','button button-secondary'),refresh=element('button','Restore saved state','button button-secondary'),start=element('button','Start timed attempt','button');
  for(const button of[close,refresh,start])button.type='button';actions.append(close,refresh,start);dialog.append(eyebrow,title,timer,feedback,surface,actions);document.body.append(dialog);
  let level=null,attempt=null,game=null,generation=0,working=false,recovery=false,interval=null,baseMs=0,baseAt=0,aspect=1,expiredRequested=false;
  function stop(){if(interval!==null)clearInterval(interval);interval=null;}
  function invalidate(){generation++;stop();game?.destroy();game=null;attempt=null;level=null;working=false;dialog.close();}
  for(const event of ['access:checking','access:blocked'])document.addEventListener(event,invalidate);
  dialog.addEventListener('close',()=>{generation++;stop();game?.destroy();game=null;attempt=null;level=null;});close.addEventListener('click',()=>dialog.close());
  function clock(){
    if(!attempt)return;
    const seconds=attempt.status==='active'?remainingSeconds(baseMs,baseAt,performance.now()):0;
    timer.textContent=attempt.status==='completed'?'✓ Completed':attempt.status==='expired'?'Time expired':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;
    timer.classList.toggle('clock-warning',seconds<=30&&attempt.status==='active');
    if(attempt.status==='active'&&seconds===0){game?.render(attempt.state,true);if(!working&&!recovery&&!expiredRequested){expiredRequested=true;restore();}}
  }
  function apply(result){
    attempt=result;recovery=false;expiredRequested=false;start.hidden=true;refresh.hidden=result.status!=='active';
    // server_time is captured at response creation, after processing the request.
    // Anchor at receipt; the server still decides whether a late move can score.
    baseMs=Math.max(0,Date.parse(result.expires_at)-Date.parse(result.server_time));baseAt=performance.now();
    if(!game)game=result.kind==='maze'?mazeGame(surface,{settings:result.settings,onMove:move}):jigsawGame(surface,{settings:result.settings,onMove:move,aspect});
    game.render(result.state,result.status!=='active');clock();
    if(result.status==='completed'){stop();errorNotice(feedback,`Level completed! ${result.awarded_points} points earned. The next level is now unlocked.`,'success');onChanged();}
    else if(result.status==='expired'){stop();errorNotice(feedback,'Time is up. This attempt finished with 0 points. Continue to the next level.','warning');onChanged();}
    else if(result.outcome==='stale_move')errorNotice(feedback,'Your board changed in another tab. The latest saved state is restored.','warning');
    else if(interval===null)interval=setInterval(clock,250);
  }
  async function request(operation){
    if(working||!level||!dialog.open)return;
    const requestId=generation;working=true;start.disabled=true;refresh.disabled=true;errorNotice(feedback,'');
    if(attempt)game?.render(attempt.state,true);
    try{const result=await operation();if(requestId!==generation||!dialog.open)return;apply(result);}
    catch(error){if(requestId!==generation)return;recovery=true;errorNotice(feedback,`${arenaError(error)} Use “Restore saved state” before continuing.`);if(attempt)game?.render(attempt.state,true);onAccessDenied(error);}
    finally{if(requestId===generation){working=false;start.disabled=false;refresh.disabled=false;if(attempt&&!recovery)game?.render(attempt.state,attempt.status!=='active'||remainingSeconds(baseMs,baseAt,performance.now())===0);}}
  }
  async function restore(){if(attempt&&attempt.status!=='active')return;return request(()=>service.start(level.id));}
  async function move(value){if(!attempt||attempt.status!=='active'||recovery||remainingSeconds(baseMs,baseAt,performance.now())===0)return;return request(()=>service.move(level.id,value,attempt.revision));}
  start.addEventListener('click',restore);refresh.addEventListener('click',restore);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dialog.open&&attempt?.status==='active'&&!working)restore();});
  async function open(selected){
    if(dialog.open||['completed','expired'].includes(selected.state)||document.getElementById('protected-content').hidden)return;
    generation++;level=selected;attempt=null;working=false;recovery=false;aspect=1;errorNotice(feedback,'');start.hidden=false;start.disabled=true;refresh.hidden=true;
    title.textContent=selected.title;eyebrow.textContent=`Level ${selected.id} · ${selected.points} points`;timer.textContent=`${Math.floor(selected.settings.seconds/60)} minutes ${selected.settings.seconds%60?selected.settings.seconds%60+' seconds':''}`;
    surface.replaceChildren(element('p',selected.description||(selected.kind==='maze'?'Reach the opposite exit before time runs out. Choose corridors carefully: some lead to dead ends, others take longer.':'Assemble all shuffled pieces into the complete picture before time runs out.'),'game-intro'),element('p','One timed attempt. Closing this window or refreshing does not pause the timer. If already started, this button resumes your saved attempt.','small muted'));
    dialog.showModal();dialog.scrollTop=0;const requestId=generation;
    if(selected.kind==='jigsaw'){
      try{const img=new Image();img.src=selected.settings.image;await img.decode();if(requestId!==generation)return;aspect=img.naturalWidth/img.naturalHeight;}
      catch{if(requestId===generation)errorNotice(feedback,'The puzzle image could not load. Close and reopen this challenge when your connection is ready. Your timer has not been started.');return;}
    }
    if(requestId===generation){start.disabled=false;start.focus({preventScroll:true});}
  }
  return {open,invalidate};
}
