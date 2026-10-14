import {element} from './common.js';
import {errorNotice,formatDate} from './admin-ui.js';
import {arenaError} from './arena-model.js';
import {timedGame} from './timed-game.js';

export function studentArena(root,service,{onQuestion,onChanged,onAccessDenied}) {
  const strip=document.getElementById('arena-progress'),cards=root.querySelector('[data-arena-cards]'),feedback=root.querySelector('[data-arena-feedback]');
  const refresh=root.querySelector('[data-arena-refresh]');let generation=0;
  const game=timedGame(service,{onChanged(){load();onChanged();},onAccessDenied});
  const labels={current:'Current',completed:'Completed',locked:'Locked',expired:'Expired'};
  const symbols={current:'●',completed:'✓',locked:'🔒',expired:'⌛'};
  function invalidate(){generation++;game.invalidate();strip.replaceChildren();cards.replaceChildren();}
  for(const event of['access:checking','access:blocked'])document.addEventListener(event,invalidate);
  async function load(){
    const request=++generation;refresh.disabled=true;errorNotice(feedback,'');
    try{
      const data=await service.progress();if(request!==generation)return;
      strip.replaceChildren(...data.levels.map(level=>{
        const item=element('li',undefined,`level-step level-${level.state}`);
        item.append(element('span',`${symbols[level.state]} ${level.id}`,'level-number'),element('strong',level.title),element('small',labels[level.state]));
        if(level.state==='current')item.setAttribute('aria-current','step');return item;
      }));
      cards.replaceChildren();
      if(!data.enabled){errorNotice(feedback,'The five-level competition is not open yet. The organizer will publish it when the question sets and challenges are ready.','info');return;}
      for(const level of data.levels){
        const card=element('article',undefined,`arena-level-card arena-${level.state}`);card.append(element('p',`LEVEL ${level.id} · ${labels[level.state]}`,'eyebrow'),element('h3',level.title));
        if(level.state==='locked'){card.append(element('p',`Complete level ${level.id-1} to unlock this challenge.`,'small muted'));}
        else if(level.state==='expired'){card.append(element('p','Your timed attempt has ended. Subsequent levels remain locked.','small muted'));}
        else if(level.kind==='questions'){
          card.append(element('p','Solve every question in this phase to unlock the next level.','small muted'));
          for(const question of level.questions){
            const row=element('div',undefined,'arena-question');row.append(element('span',`${question.solved?'✓ ':''}${question.title} · ${question.points} points`));
            const button=element('button',question.solved?'Solved':question.available?'Answer':'Unavailable','button button-secondary button-small');button.type='button';button.disabled=question.solved||!question.available;
            button.setAttribute('aria-label',`Open ${question.title}`);button.addEventListener('click',()=>onQuestion(question));row.append(button);card.append(row);
          }
          if(!level.questions.length)card.append(element('p','The organizer needs to add questions to this phase.','small muted'));
        }else{
          const detail=level.kind==='jigsaw'?`${level.settings.rows*level.settings.cols} pieces`:'Branching corridors and dead ends';
          card.append(element('p',`${detail} · ${level.settings.seconds} seconds · ${level.points} points`,'small muted'));
          if(level.opens_at)card.append(element('p',`Opens ${formatDate(level.opens_at)}`,'small muted'));
          if(level.closes_at)card.append(element('p',`Closes ${formatDate(level.closes_at)}`,'small muted'));
          const button=element('button',!level.available?'Currently unavailable':level.state==='completed'?'View completed challenge':'Start or resume challenge','button button-small');button.type='button';button.disabled=!level.available;button.setAttribute('aria-label',`${level.state==='completed'?'View':'Start'} level ${level.id}`);button.addEventListener('click',()=>game.open(level));card.append(button);
        }
        cards.append(card);
      }
      if(data.levels.length&&data.levels.every(level=>level.state==='completed'))errorNotice(feedback,'You completed every level. Congratulations! Your points are on the leaderboard.','success');
    }catch(error){if(request===generation){strip.replaceChildren();cards.replaceChildren();errorNotice(feedback,arenaError(error),['PGRST202','42883'].includes(error.code)?'info':'error');}onAccessDenied(error);}
    finally{if(request===generation)refresh.disabled=false;}
  }
  refresh.addEventListener('click',load);
  return {load,invalidate};
}
