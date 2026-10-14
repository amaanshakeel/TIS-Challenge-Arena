import {element,busy} from './common.js';
import {errorNotice} from './admin-ui.js';
import {arenaError,buildMaze,inspectMaze} from './arena-model.js';
import {mazeGame} from './maze-game.js';
import {localDateInput} from './admin-validation.js';

export function adminArena(root,service,{onChanged,onAccessDenied}) {
  const feedback=root.querySelector('[data-arena-admin-feedback]'),refresh=root.querySelector('[data-arena-admin-refresh]'),form=root.querySelector('form');
  let original=null,generation=0,saving=false,previewGame=null;
  const preview=element('dialog',undefined,'admin-dialog arena-preview-dialog');preview.id='arena-preview-dialog';preview.setAttribute('aria-labelledby','arena-preview-title');
  const previewTitle=element('h2');previewTitle.id='arena-preview-title';const previewBody=element('div'),previewClose=element('button','Close preview','button button-secondary');previewClose.type='button';
  preview.append(previewTitle,element('p','Organizer preview. This does not start an attempt, award points or unlock levels.','small muted'),previewBody,previewClose);document.body.append(preview);
  previewClose.addEventListener('click',()=>preview.close());preview.addEventListener('close',()=>{previewGame?.destroy();previewGame=null;previewBody.replaceChildren();});
  for(const event of['access:checking','access:blocked'])document.addEventListener(event,()=>{generation++;form.hidden=true;preview.close();});
  function field(parent,name,label,value,{min,max,disabled=false,type='number',required=true}={}){
    const box=element('div',undefined,'field'),labelNode=element('label',label),input=element('input');input.id=`arena-${name}`;input.name=name;input.type=type;input.value=value;input.disabled=disabled;
    if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(type==='number'||type==='datetime-local')input.step='1';if(type==='text')input.maxLength=160;input.required=required;labelNode.htmlFor=input.id;box.append(labelNode,input);parent.append(box);return input;
  }
  function questionOptions(parent,phase,selected){
    const options=element('div',undefined,'arena-question-options');
    const available=original.questions.filter(q=>!q.attempted||selected.includes(q.id)||q.arena_level!==null);
    for(const question of available){
      const label=element('label',undefined,'arena-question-option'),input=element('input');input.type='checkbox';input.name=phase;input.value=question.id;input.checked=selected.includes(question.id);input.disabled=original.locked;
      label.append(input,element('span',`${question.title} · ${question.points} points · ${question.status}`));options.append(label);
    }
    if(!available.length)options.append(element('p','Create question puzzles in Puzzles, then refresh this screen. Questions with previous standalone attempts cannot be added to a new course.','small muted'));
    parent.append(options);
  }
  function render(){
    form.replaceChildren();form.hidden=false;
    const enabledLabel=element('label',undefined,'arena-question-option'),enabled=element('input');enabled.type='checkbox';enabled.name='enabled';enabled.checked=original.config.enabled;
    enabledLabel.append(enabled,element('strong','Open the five-level competition'));form.append(enabledLabel,element('p',original.locked?'Participation has started. Scoring, timers, layouts and question assignments are locked. You can edit instructions, titles and availability, or close and reopen the course.':'Choose published questions for both phases, review the challenge settings, then open the competition.','small muted arena-help'));
    for(const level of original.config.levels){
      const box=element('fieldset',undefined,'arena-admin-level');box.append(element('legend',`Level ${level.id}: ${level.kind==='questions'?'Questions':level.kind==='maze'?'Timed maze':'Timed jigsaw'}`));
      field(box,`level-${level.id}-title`,'Level title',level.title,{type:'text'});
      if(level.kind==='questions')questionOptions(box,level.id===1?'opening_question_ids':'final_question_ids',original.config[level.id===1?'opening_question_ids':'final_question_ids']);
      else{
        const descriptionBox=element('div',undefined,'field'),descriptionLabel=element('label','Challenge instructions'),description=element('textarea');
        description.name=`level-${level.id}-description`;description.id=`arena-level-${level.id}-description`;description.value=level.description;description.maxLength=10000;description.required=true;description.rows=3;descriptionLabel.htmlFor=description.id;descriptionBox.append(descriptionLabel,description);box.append(descriptionBox);
        const dates=element('div',undefined,'arena-settings-row');
        for(const [name,label]of[['opens_at','Opens at (optional)'],['closes_at','Closes at (optional)']])field(dates,`level-${level.id}-${name}`,label,localDateInput(level[name]),{type:'datetime-local',required:false});
        box.append(dates,element('p','Availability uses your local time. Changing a closing time never extends a student’s original attempt deadline.','small muted'));
        const row=element('div',undefined,'arena-settings-row');field(row,`level-${level.id}-seconds`,'Time limit (seconds)',level.settings.seconds,{min:30,max:1800,disabled:original.locked});
        field(row,`level-${level.id}-points`,'Completion points',level.points,{min:1,max:10000,disabled:original.locked});box.append(row);
        if(level.kind==='jigsaw'){
          field(row,`level-${level.id}-rows`,'Rows',level.settings.rows,{min:3,max:8,disabled:original.locked});field(row,`level-${level.id}-cols`,'Columns',level.settings.cols,{min:3,max:8,disabled:original.locked});
          box.append(element('p',level.id===2?'Supplied society logo. More pieces increase difficulty.':'Supplied robot workspace image. The landscape aspect ratio is preserved.','small muted'));
        }else{
          const label=element('label','Maze layout (. = corridor, # = wall)'),input=element('textarea');input.name='maze-grid';input.id='arena-maze-grid';input.className='arena-maze-layout';input.value=level.settings.grid.join('\n');input.disabled=original.locked;input.spellcheck=false;label.htmlFor=input.id;
          const fieldBox=element('div',undefined,'field');fieldBox.append(label,input);box.append(fieldBox);
          const generate=element('button','Generate a different maze','button button-secondary button-small');generate.type='button';generate.disabled=original.locked;generate.addEventListener('click',()=>{const seed=crypto.getRandomValues(new Uint32Array(1))[0];input.value=buildMaze(seed).join('\n');});box.append(generate);
          box.append(element('p','The entrance is at the top, column 2. The exit is at the bottom, second column from the right. The maze must include dead ends and alternative routes.','small muted'));
        }
        const previewButton=element('button','Preview challenge','button button-secondary button-small');previewButton.type='button';previewButton.setAttribute('aria-label',`Preview level ${level.id}`);previewButton.addEventListener('click',()=>showPreview(level.id));box.append(previewButton);
      }
      form.append(box);
    }
    const save=element('button','Save competition settings','button');save.type='submit';form.append(save);
  }
  function configFromForm(){
    const config=structuredClone(original.config);config.enabled=form.elements.enabled.checked;
    if(!original.locked){config.opening_question_ids=Array.from(form.querySelectorAll('[name=opening_question_ids]:checked'),input=>input.value);
    config.final_question_ids=Array.from(form.querySelectorAll('[name=final_question_ids]:checked'),input=>input.value);}
    if(config.opening_question_ids.some(id=>config.final_question_ids.includes(id)))throw {message:'invalid_course'};
    for(const level of config.levels){
      level.title=form.elements.namedItem(`level-${level.id}-title`).value.trim();if(level.title.length<2||level.title.length>160)throw {message:'invalid_course'};
      if(level.kind==='questions')continue;
      level.description=form.elements.namedItem(`level-${level.id}-description`).value.trim();if(!level.description||level.description.length>10000)throw {message:'invalid_course'};
      for(const name of['opens_at','closes_at']){const value=form.elements.namedItem(`level-${level.id}-${name}`).value;level[name]=value?new Date(value).toISOString():null;}
      if(level.opens_at&&level.closes_at&&Date.parse(level.opens_at)>=Date.parse(level.closes_at))throw {message:'invalid_course'};
      if(original.locked)continue;
      for(const [name,min,max]of[['seconds',30,1800],['points',1,10000],...(level.kind==='jigsaw'?[['rows',3,8],['cols',3,8]]:[])]){
        const value=Number(form.elements.namedItem(`level-${level.id}-${name}`).value);if(!Number.isInteger(value)||value<min||value>max)throw {message:'invalid_course'};
        if(name==='points')level.points=value;else level.settings[name]=value;
      }
      if(level.kind==='maze'){level.settings.grid=form.elements.namedItem('maze-grid').value.replace(/\r/g,'').trim().split('\n');const data=inspectMaze(level.settings.grid);if(!data.deadEnds||!data.alternativePath.length)throw {message:'invalid_maze'};}
    }
    if(config.enabled&&(!config.opening_question_ids.length||!config.final_question_ids.length))throw {message:'invalid_course'};
    return config;
  }
  async function showPreview(id){
    try{
      const config=configFromForm(),level=config.levels[id-1];previewGame?.destroy();previewGame=null;previewBody.replaceChildren();previewTitle.textContent=`Preview: ${level.title}`;
      if(level.kind==='jigsaw'){const img=element('img');img.src=level.settings.image;img.alt=`Complete reference image for ${level.title}`;previewBody.append(img);}
      else{
        const state={position:1,visited:[1],moves:0},width=level.settings.grid[0].length;
        previewGame=mazeGame(previewBody,{settings:level.settings,onMove(move){const delta={up:-width,down:width,left:-1,right:1}[move.direction];state.position+=delta;state.moves++;if(!state.visited.includes(state.position))state.visited.push(state.position);previewGame.render(state);}});previewGame.render(state);
      }
      preview.showModal();preview.scrollTop=0;
    }catch(error){errorNotice(feedback,arenaError(error));}
  }
  async function load(){
    if(saving)return;const request=++generation;refresh.disabled=true;form.hidden=true;errorNotice(feedback,'');
    try{const result=await service.settings();if(request!==generation)return;original=result;render();}
    catch(error){if(request===generation)errorNotice(feedback,arenaError(error));onAccessDenied(error);}
    finally{if(request===generation)refresh.disabled=false;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||!original)return;let config;
    try{config=configFromForm();}catch(error){errorNotice(feedback,arenaError(error));return;}
    if(!form.reportValidity())return;const request=generation,submit=form.querySelector('[type=submit]');saving=true;busy(submit,true,'Saving settings…');refresh.disabled=true;errorNotice(feedback,'');
    try{const result=await service.save(config,original.updated_at);if(request!==generation)return;original=result;render();errorNotice(feedback,config.enabled?'Competition open. Participants must complete all five levels in order.':'Settings saved. The competition levels are closed.','success');onChanged();}
    catch(error){if(request===generation)errorNotice(feedback,arenaError(error));onAccessDenied(error);}
    finally{saving=false;if(request===generation){busy(submit,false);refresh.disabled=false;}}
  });
  refresh.addEventListener('click',load);return {load};
}
