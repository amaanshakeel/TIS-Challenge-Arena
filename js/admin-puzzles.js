import {element,fieldErrors,busy} from './common.js';
import {statusBadge,formatDate,tableMessage,pager,errorNotice,confirmAction} from './admin-ui.js';
import {validatePuzzle,adminErrorMessage,localDateInput} from './admin-validation.js';

export function puzzleSection(root,service,{onChanged,onAccessDenied}) {
  const filters=root.querySelector('[data-filters]'),body=root.querySelector('tbody'),pagination=root.querySelector('[data-pagination]');
  const feedback=root.querySelector('[data-feedback]'),refresh=root.querySelector('[data-refresh]');
  const dialog=document.getElementById('puzzle-dialog'),form=document.getElementById('puzzle-form');
  const editorNotice=document.getElementById('puzzle-notice');
  let original=null,page=1,generation=0,editorGeneration=0,changing=false,saving=false,loadingEditor=false;
  for(const event of ['access:checking','access:blocked'])document.addEventListener(event,()=>{editorGeneration++;});
  async function load() {
    const request=++generation;const filter=Object.fromEntries(new FormData(filters));
    tableMessage(body,7,'Loading puzzles…');pagination.replaceChildren();refresh.disabled=true;
    try {
      const result=await service.puzzles({search:filter.search.trim(),status:filter.status,page});if(request!==generation)return;
      const last=Math.max(1,Math.ceil(result.total/result.page_size));if(page>last){page=last;return await load();}
      if(!result.rows.length)tableMessage(body,7,'No puzzles match these filters. Create a puzzle to get started.');
      else body.replaceChildren(...result.rows.map(puzzle=>{
        const tr=element('tr');const title=element('td');title.append(element('strong',puzzle.title),element('small',puzzle.difficulty??'No difficulty','muted cell-detail'));tr.append(title);
        tr.append(element('td',String(puzzle.points)));
        const status=element('td');status.append(statusBadge(puzzle.status));tr.append(status);
        const window=element('td');window.append(element('span',puzzle.opens_at?`Opens ${formatDate(puzzle.opens_at)}`:'No opening limit'),element('small',puzzle.closes_at?`Closes ${formatDate(puzzle.closes_at)}`:'No closing limit','muted cell-detail'));tr.append(window);
        tr.append(element('td',String(puzzle.attempts)),element('td',String(puzzle.successful_solves)));
        const actions=element('td'),buttons=element('div',undefined,'table-actions');
        const edit=element('button','Edit','table-button');edit.type='button';edit.setAttribute('aria-label',`Edit ${puzzle.title}`);edit.addEventListener('click',()=>openEditor(puzzle.id));buttons.append(edit);
        for(const target of (puzzle.status==='published'?['closed','draft']:['published'])) {
          const label={published:'Publish',closed:'Close',draft:'Unpublish'}[target];
          const button=element('button',label,'table-button');button.type='button';button.setAttribute('aria-label',`${label} ${puzzle.title}`);button.addEventListener('click',()=>changeStatus(puzzle,target,button,label));buttons.append(button);
        }
        actions.append(buttons);tr.append(actions);return tr;
      }));
      pager(pagination,result,next=>{page=next;load();});
    }catch(error){if(request!==generation)return;tableMessage(body,7,'Puzzle data could not be loaded. Try refreshing.');errorNotice(feedback,adminErrorMessage(error));onAccessDenied(error);}
    finally{if(request===generation)refresh.disabled=false;}
  }
  async function openEditor(id=null) {
    if(loadingEditor||saving||dialog.open||document.getElementById('protected-content').hidden)return;
    const request=++editorGeneration;loadingEditor=true;errorNotice(feedback,'');
    const create=root.querySelector('[data-create]');create.disabled=true;
    try {
      const detail=id?await service.puzzle(id):null;
      if(request!==editorGeneration||document.getElementById('protected-content').hidden)return;
      original=detail;form.reset();fieldErrors({});errorNotice(editorNotice,'');
      dialog.querySelector('h2').textContent=original?'Edit puzzle':'Create puzzle';
      for(const field of ['title','description','correct_answer','points','difficulty','status','opens_at','closes_at']) {
        const input=form.elements.namedItem(field);const value=original?.[field];
        input.value=['opens_at','closes_at'].includes(field)?localDateInput(value):value??(field==='status'?'draft':field==='points'?'20':'');
      }
      form.elements.case_sensitive.checked=Boolean(original?.case_sensitive);
      for(const field of ['points','correct_answer','case_sensitive'])form.elements.namedItem(field).disabled=Boolean(original?.scoring_locked);
      document.getElementById('scoring-lock-note').hidden=!original?.scoring_locked;
      dialog.showModal();form.elements.title.focus({preventScroll:true});dialog.scrollTop=0;
    }catch(error){errorNotice(feedback,adminErrorMessage(error));onAccessDenied(error);}
    finally{loadingEditor=false;create.disabled=false;}
  }
  async function changeStatus(puzzle,target,button,label) {
    if(changing)return;changing=true;
    try {
      if(!await confirmAction({title:`${label} puzzle?`,message:`${puzzle.title}. ${target==='published'?'Approved students can access it within its availability window.':'New scored submissions will not be accepted while it is unavailable.'}`,label}))return;
      button.disabled=true;errorNotice(feedback,'');await service.setPuzzleStatus(puzzle,target);
      errorNotice(feedback,`Puzzle ${target==='published'?'published':target==='closed'?'closed':'returned to draft'}.`,'success');await load();onChanged();
    }catch(error){errorNotice(feedback,adminErrorMessage(error));onAccessDenied(error);}
    finally{changing=false;button.disabled=false;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    const data=Object.fromEntries(new FormData(form));data.case_sensitive=form.elements.case_sensitive.checked;
    const {values,errors}=validatePuzzle(data,original);fieldErrors(errors);if(Object.keys(errors).length)return;
    const submit=form.querySelector('[type=submit]');saving=true;busy(submit,true,'Saving puzzle…');errorNotice(editorNotice,'');
    try {
      await service.savePuzzle(values,original);dialog.close();errorNotice(feedback,original?'Puzzle updated.':'Puzzle created.','success');
      await load();onChanged();
    }catch(error){errorNotice(editorNotice,adminErrorMessage(error));onAccessDenied(error);}
    finally{saving=false;busy(submit,false);}
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{form.reset();original=null;});
  dialog.querySelector('[data-cancel]').addEventListener('click',()=>{if(!saving)dialog.close();});
  root.querySelector('[data-create]').addEventListener('click',()=>openEditor());
  filters.addEventListener('submit',event=>{event.preventDefault();page=1;errorNotice(feedback,'');load();});
  filters.querySelector('select').addEventListener('change',()=>{page=1;errorNotice(feedback,'');load();});
  refresh.addEventListener('click',()=>{errorNotice(feedback,'');load();});
  return {load};
}
