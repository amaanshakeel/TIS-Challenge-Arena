import {element,busy} from './common.js';
import {pager,errorNotice,formatDate} from './admin-ui.js';
import {validateAnswer,submissionFeedback,competitionErrorMessage} from './competition-validation.js';

export function studentPuzzles(root,service,{onChanged,onAccessDenied}) {
  const list=root.querySelector('[data-puzzle-list]'),pagination=root.querySelector('[data-pagination]'),feedback=root.querySelector('[data-feedback]');
  const refresh=root.querySelector('[data-refresh]'),dialog=document.getElementById('solve-dialog'),form=document.getElementById('answer-form');
  const answer=document.getElementById('answer'),errorNode=document.getElementById('answer-error'),solveFeedback=document.getElementById('solve-feedback'),submit=form.querySelector('[type=submit]');
  let page=1,generation=0,current=null,submitting=false;
  function invalidate(){generation++;dialog.close();}
  for(const event of ['access:checking','access:blocked'])document.addEventListener(event,invalidate);
  async function load() {
    const request=++generation;list.replaceChildren(element('p','Loading available puzzles…','muted'));pagination.replaceChildren();refresh.disabled=true;errorNotice(feedback,'');
    try {
      const data=await service.puzzles({page});if(request!==generation)return;
      const last=Math.max(1,Math.ceil(data.total/data.page_size));if(page>last){page=last;return await load();}
      if(!data.rows.length)list.replaceChildren(element('p','No puzzles are available right now. Check back when the TIS team publishes a challenge.','puzzle-empty muted'));
      else list.replaceChildren(...data.rows.map(puzzle=>{
        const card=element('article',undefined,'puzzle-card');const top=element('div',undefined,'puzzle-card-top');
        top.append(element('span',puzzle.difficulty??'Challenge','pill'),element('span',`${puzzle.points} points`,'puzzle-points'));card.append(top,element('h3',puzzle.title));
        card.append(element('p',puzzle.description.length>240?puzzle.description.slice(0,240)+'…':puzzle.description,'muted puzzle-description'));
        const state=element('p',puzzle.solved?'✓ Solved':puzzle.attempt_count?`${puzzle.attempt_count} ${puzzle.attempt_count===1?'attempt':'attempts'} · Keep going`:'Ready for your first attempt',puzzle.solved?'solve-state solved':'solve-state muted');
        const availability=element('small',puzzle.closes_at?`Closes ${formatDate(puzzle.closes_at)}`:'Available now · No closing limit','muted');
        const button=element('button',puzzle.solved?'View solved puzzle':'Open puzzle',puzzle.solved?'button button-secondary button-small':'button button-small');button.type='button';button.setAttribute('aria-label',`${puzzle.solved?'View':'Open'} ${puzzle.title}`);
        button.addEventListener('click',()=>open(puzzle));card.append(state,availability,button);return card;
      }));
      pager(pagination,data,next=>{page=next;load();});
    }catch(error){if(request!==generation)return;list.replaceChildren(element('p','Puzzles could not be loaded. Try refreshing.','muted'));errorNotice(feedback,competitionErrorMessage(error));onAccessDenied(error);}
    finally{if(request===generation)refresh.disabled=false;}
  }
  function open(puzzle) {
    if(submitting||document.getElementById('protected-content').hidden)return;
    current=puzzle;form.reset();errorNode.textContent='';answer.removeAttribute('aria-invalid');errorNotice(solveFeedback,'');
    document.getElementById('solve-title').textContent=puzzle.title;document.getElementById('solve-description').textContent=puzzle.description;
    document.getElementById('solve-points').textContent=`${puzzle.points} points · ${puzzle.difficulty??'Challenge'}`;
    answer.disabled=puzzle.solved;submit.disabled=puzzle.solved;
    if(puzzle.solved)errorNotice(solveFeedback,'You have already solved this puzzle. Your points are counted once.','success');
    dialog.showModal();if(!puzzle.solved)answer.focus({preventScroll:true});dialog.scrollTop=0;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submitting||!current||current.solved)return;
    const {value,error}=validateAnswer(answer.value);errorNode.textContent=error??'';
    if(error){answer.setAttribute('aria-invalid','true');answer.focus();return;}answer.removeAttribute('aria-invalid');
    const request=generation;const puzzle=current;submitting=true;busy(submit,true,'Checking answer…');answer.disabled=true;errorNotice(solveFeedback,'');
    try {
      const result=await service.submitAnswer(puzzle.id,value);if(request!==generation||!dialog.open)return;
      const state=submissionFeedback(result);errorNotice(solveFeedback,state.message,state.tone);
      if(state.solved){puzzle.solved=true;answer.value='';}
      if(state.unavailable){puzzle.unavailable=true;}
      if(result.outcome==='incorrect'||state.solved||state.unavailable){await load();if(state.solved||state.unavailable)onChanged();}
    }catch(error){if(request===generation&&dialog.open)errorNotice(solveFeedback,competitionErrorMessage(error));onAccessDenied(error);}
    finally{submitting=false;busy(submit,false);answer.disabled=Boolean(current?.solved||current?.unavailable);submit.disabled=answer.disabled;}
  });
  dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  dialog.querySelector('[data-close-solve]').addEventListener('click',()=>{if(!submitting)dialog.close();});
  dialog.addEventListener('close',()=>{current=null;form.reset();});
  refresh.addEventListener('click',load);
  return {load,invalidate,open};
}
