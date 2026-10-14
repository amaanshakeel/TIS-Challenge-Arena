export function validatePuzzle(data,original=null) {
  const values={title:String(data.title??'').trim(),description:String(data.description??'').trim(),correct_answer:String(data.correct_answer??'').trim(),
    points:Number(data.points),difficulty:data.difficulty||null,status:data.status,case_sensitive:Boolean(data.case_sensitive)};
  const errors={};
  for(const [field,min,max,label] of [['title',2,160,'title'],['description',1,10000,'description']]) {
    if(values[field].length<min || values[field].length>max)errors[field]=`Enter a ${label} between ${min} and ${max} characters.`;
  }
  if(original?.scoring_locked){values.correct_answer=null;values.points=original.points;values.case_sensitive=original.case_sensitive;}
  else {
    if(values.correct_answer.length<1 || values.correct_answer.length>500)errors.correct_answer='Enter an answer between 1 and 500 characters.';
    if(!Number.isInteger(values.points) || values.points<1 || values.points>10000)errors.points='Use a whole number of points between 1 and 10,000.';
  }
  if(values.difficulty!==null && !['easy','medium','hard'].includes(values.difficulty))errors.difficulty='Choose a valid difficulty.';
  if(!['draft','published','closed'].includes(values.status))errors.status='Choose a valid publication status.';
  for(const field of ['opens_at','closes_at']) {
    const input=String(data[field]??'').trim();values[field]=null;
    if(!input)continue;
    const date=new Date(input);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?$/.test(input) || !Number.isFinite(date.getTime()))errors[field]='Enter a valid local date and time.';
    else values[field]=date.toISOString();
  }
  if(values.opens_at && values.closes_at && new Date(values.opens_at)>=new Date(values.closes_at))errors.closes_at='Closing time must be after opening time.';
  return {values,errors};
}

export function localDateInput(timestamp) {
  if(!timestamp)return '';
  const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return '';
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function adminErrorMessage(error) {
  const messages={admin_required:'Your administrative access is no longer available. Recheck access or sign in again.',
    stale_record:'This record changed since you opened it. Refresh the list, then reopen it and try again.',
    invalid_transition:'That status change is no longer valid. Refresh the participant list.',
    restoration_unavailable:'The previous status is unavailable. Ask the project owner to review this participant before restoring access.',
    student_required:'Administrative accounts cannot be changed through participant management.',
    record_not_found:'This record is no longer available. Refresh the list.',
    invalid_input:'Check the entered fields and dates, then try again.',
    scoring_locked:'Answers, case sensitivity, and points are locked because this puzzle has recorded attempts.',
    answer_required:'Add a valid correct answer before publishing this puzzle.',
    course_locked:'This question belongs to a competition that has started. Its answer and points are locked.',
    visual_challenge_required:'Edit visual challenge settings in Competition levels.'};
  if(messages[error?.message])return messages[error.message];
  if(['PGRST301','PGRST303','bad_jwt','session_not_found'].includes(error?.code)||error?.status===401)return 'Your session has expired. Please sign in again.';
  if(['PGRST202','PGRST205','42883'].includes(error?.code))return 'The dashboard database setup is incomplete. Ask the project owner to run the Part 2 SQL after the foundation SQL.';
  if(error?.code==='42501')return messages.admin_required;
  return 'We could not complete that request. Check your connection and try again.';
}
