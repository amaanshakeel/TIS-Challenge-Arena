export function remainingSeconds(durationMs,startedAt,now) {
  return Math.max(0,Math.ceil((durationMs-Math.max(0,now-startedAt))/1000));
}

export function inspectMaze(grid) {
  const height=grid?.length,width=grid?.[0]?.length;
  if(!Array.isArray(grid)||height<5||height>41||width<5||width>61||grid.some(row=>typeof row!=='string'||row.length!==width||/[^#.]/.test(row)))throw new Error('Invalid maze dimensions or cells.');
  const start=width+1,finish=(height-1)*width+width-2,entrance=1;
  if(grid[0][1]!=='.'||grid[height-1][width-2]!=='.')throw new Error('Maze needs opposite entrances.');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if((y===0||y===height-1||x===0||x===width-1)&&grid[y][x]==='.'&&y*width+x!==entrance&&y*width+x!==finish)throw new Error('Unexpected boundary opening.');
  const seen=new Map([[entrance,null]]),queue=[entrance];let edges=0,deadEnds=0;
  const neighbors=index=>{
    const x=index%width,y=Math.floor(index/width);
    return [[x,y-1],[x+1,y],[x,y+1],[x-1,y]].filter(([nx,ny])=>nx>=0&&ny>=0&&nx<width&&ny<height&&grid[ny][nx]==='.').map(([nx,ny])=>ny*width+nx);
  };
  for(let i=0;i<queue.length;i++){
    const current=queue[i],adjacent=neighbors(current);edges+=adjacent.length;
    if(adjacent.length===1&&current!==entrance&&current!==finish)deadEnds++;
    for(const next of adjacent)if(!seen.has(next)){seen.set(next,current);queue.push(next);}
  }
  if(!seen.has(start)||!seen.has(finish))throw new Error('Maze exit is unreachable.');
  const shortestPath=[];for(let cell=finish;cell!==null;cell=seen.get(cell))shortestPath.unshift(cell);
  let alternativePath=[];
  for(let edge=1;edge<shortestPath.length&&!alternativePath.length;edge++){
    const a=shortestPath[edge-1],b=shortestPath[edge],parents=new Map([[entrance,null]]),pending=[entrance];
    for(let j=0;j<pending.length&&!parents.has(finish);j++)for(const next of neighbors(pending[j])){
      if((pending[j]===a&&next===b)||(pending[j]===b&&next===a)||parents.has(next))continue;
      parents.set(next,pending[j]);pending.push(next);
    }
    if(parents.has(finish)){const path=[];for(let cell=finish;cell!==null;cell=parents.get(cell))path.unshift(cell);if(path.length>shortestPath.length)alternativePath=path;}
  }
  return {reachable:true,deadEnds,cycles:edges/2-seen.size+1,shortestPath,alternativePath,width,height};
}

export function buildMaze(seed=2026) {
  const height=19,width=27,grid=Array.from({length:height},()=>Array(width).fill('#'));
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const stack=[[1,1]];grid[1][1]='.';
  while(stack.length){
    const [x,y]=stack.at(-1),choices=[[0,-2],[2,0],[0,2],[-2,0]].filter(([dx,dy])=>x+dx>0&&y+dy>0&&x+dx<width-1&&y+dy<height-1&&grid[y+dy][x+dx]==='#');
    if(!choices.length){stack.pop();continue;}
    const [dx,dy]=choices[Math.floor(random()*choices.length)];grid[y+dy/2][x+dx/2]='.';grid[y+dy][x+dx]='.';stack.push([x+dx,y+dy]);
  }
  grid[0][1]='.';grid[height-1][width-2]='.';
  // Create a shortcut between two cells on the original solution route.
  // This guarantees different-length entrance-to-exit routes, not just a loop in a dead end.
  const originalPath=inspectMaze(grid.map(row=>row.join(''))).shortestPath;
  const onPath=new Map(originalPath.map((cell,index)=>[cell,index]));
  const shortcuts=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(grid[y][x]==='#'){
    for(const [a,b]of[[y*width+x-1,y*width+x+1],[(y-1)*width+x,(y+1)*width+x]])if(onPath.has(a)&&onPath.has(b)&&Math.abs(onPath.get(a)-onPath.get(b))>2)shortcuts.push([x,y]);
  }
  if(shortcuts.length){const [x,y]=shortcuts[Math.floor(random()*shortcuts.length)];grid[y][x]='.';}
  // Add a handful of further loops while retaining dead ends.
  const walls=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(grid[y][x]==='#'&&((x%2===0&&y%2===1)||(x%2===1&&y%2===0)))walls.push([x,y]);
  for(let i=0;i<8;i++){const index=Math.floor(random()*walls.length),[x,y]=walls.splice(index,1)[0];grid[y][x]='.';}
  const result=grid.map(row=>row.join('')),data=inspectMaze(result);
  if(!data.deadEnds||!data.alternativePath.length)return buildMaze((seed+1)>>>0);
  return result;
}

export function arenaError(error) {
  const messages={level_locked:'Complete the previous level to unlock this challenge.',course_unavailable:'The competition levels are currently closed.',course_locked:'Challenge settings and question sets are locked because participation has started.',stale_record:'Settings changed in another session. Refresh before saving.',invalid_move:'That move is not allowed.',invalid_maze:'The maze needs opposite exits, reachable paths, dead ends and alternative routes.',invalid_course:'Select published opening and final questions, and check the challenge settings.',visual_challenge_required:'Open this challenge through the competition levels.',question_already_attempted:'Questions with existing attempts cannot be assigned to a new level.',course_not_initialized:'The organizer has not configured the competition levels yet.'};
  if(messages[error?.message])return messages[error.message];
  if(error?.code==='PGRST202'||error?.code==='42883')return 'Competition levels need the visual-puzzles.sql database update. Existing standalone puzzles remain available.';
  return 'The challenge could not be updated. Refresh to restore the saved state and try again.';
}
