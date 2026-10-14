import {element} from './common.js';

export function mazeGame(root,{settings,onMove}) {
  const grid=settings.grid,width=grid[0].length,height=grid.length;
  const hint=element('p','Move from START at the top to EXIT at the bottom. Use arrow keys or the direction buttons. Dead ends cost time; any legal route to the exit succeeds.','small muted');
  const canvas=element('canvas',undefined,'maze-canvas');canvas.width=width*24;canvas.height=height*24;canvas.tabIndex=0;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Maze with branching corridors, dead ends, a top entrance and a bottom exit.');
  const positionLabel=element('p',undefined,'small maze-position');positionLabel.setAttribute('aria-live','polite');
  const labels=element('div',undefined,'maze-end-labels');labels.append(element('span','↓ START'),element('span','EXIT ↓'));
  const controls=element('div',undefined,'maze-controls');controls.setAttribute('aria-label','Maze direction controls');
  let state=null,disabled=false,focusedDirection=null;
  const deltas={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
  function canMove(direction){if(!state)return false;const [dx,dy]=deltas[direction],x=state.position%width+dx,y=Math.floor(state.position/width)+dy;return x>=0&&y>=0&&x<width&&y<height&&grid[y][x]==='.';}
  function move(direction){if(disabled)return;if(canMove(direction))onMove({direction});else positionLabel.textContent='A wall blocks that direction. Choose another corridor.';}
  const buttons={};
  for(const [direction,label]of[['up','↑ Up'],['left','← Left'],['down','↓ Down'],['right','→ Right']]){
    const button=element('button',label,'button button-secondary button-small');button.type='button';button.dataset.direction=direction;button.addEventListener('click',()=>move(direction));buttons[direction]=button;controls.append(button);
  }
  const key=event=>{const direction={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left'}[event.key];if(direction&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();move(direction);}};
  root.addEventListener('keydown',key);root.replaceChildren(hint,labels,canvas,positionLabel,controls);
  function render(next,locked=false){
    const focused=document.activeElement;if(root.contains(focused)&&focused.dataset.direction)focusedDirection=focused.dataset.direction;
    const restoreFocus=focused?.dataset.direction||focused===document.body||focused?.tagName==='DIALOG';
    state=next;disabled=locked;
    for(const [direction,button]of Object.entries(buttons)){button.disabled=disabled;button.setAttribute('aria-label',`${direction[0].toUpperCase()+direction.slice(1)}${canMove(direction)?'':', wall'}`);}
    positionLabel.textContent=`Position: row ${Math.floor(state.position/width)+1}, column ${state.position%width+1}. ${state.moves} moves. Available: ${Object.keys(deltas).filter(canMove).join(', ')||'none'}.`;
    const ctx=canvas.getContext('2d'),visited=new Set(state.visited);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const index=y*width+x;ctx.fillStyle=grid[y][x]==='#'?'#153e4b':visited.has(index)?'#d6eaf0':'#faf8ef';ctx.fillRect(x*24,y*24,24,24);
      if(index===1||index===(height-1)*width+width-2){ctx.fillStyle=index===1?'#f4ce45':'#51c68c';ctx.fillRect(x*24,y*24,24,24);}
    }
    ctx.fillStyle='#e34850';ctx.beginPath();ctx.arc((state.position%width)*24+12,Math.floor(state.position/width)*24+12,8,0,2*Math.PI);ctx.fill();
    if(!disabled&&restoreFocus&&focusedDirection)buttons[focusedDirection].focus({preventScroll:true});
  }
  return {render,destroy(){root.removeEventListener('keydown',key);root.replaceChildren();}};
}
