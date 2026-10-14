export function validateAnswer(input) {
  const value=String(input??'').replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g,'');
  return {value,error:value.length<1||value.length>500?'Enter an answer between 1 and 500 characters.':null};
}
export function submissionFeedback(result) {
  const outcomes={correct:{message:`Correct! You earned ${Number(result.awarded_points)} points.`,tone:'success',solved:true},
    incorrect:{message:Number.isInteger(result.attempts_remaining)?`That answer is not correct. ${result.attempts_remaining} ${result.attempts_remaining===1?'attempt remaining':'attempts remaining'}. Read carefully and try again.`:'That answer is not correct. Take another look and try again.',tone:'warning'},
    attempts_exhausted:{message:'Two incorrect answers. This question is now closed with 0 points and cannot be reopened.',tone:'warning',exhausted:true},
    already_solved:{message:'You have already solved this puzzle. Your points have been counted once.',tone:'success',solved:true},
    puzzle_unavailable:{message:'This puzzle is closed or no longer available for submissions. Refresh the puzzle list.',tone:'warning',unavailable:true},
    rate_limited:{message:`Please wait ${Math.max(1,Number(result.retry_after_seconds)||60)} seconds before trying again.`,tone:'warning'}};
  return Object.hasOwn(outcomes,result?.outcome)?outcomes[result.outcome]:{message:'We could not confirm your submission. Refresh your progress before trying again.',tone:'error',uncertain:true};
}
export function competitionErrorMessage(error) {
  const messages={authentication_required:'Your session has expired. Please sign in again.',
    student_not_eligible:'Your account is no longer eligible for competition access. Recheck your account status.',
    invalid_answer:'Enter an answer between 1 and 500 characters.'};
  if(messages[error?.message])return messages[error.message];
  if(['PGRST202','PGRST205','42883'].includes(error?.code))return 'Competition database setup is incomplete. Ask the TIS team to apply the Part 3 SQL.';
  if(['PGRST301','PGRST303','bad_jwt','session_not_found'].includes(error?.code)||error?.status===401)return messages.authentication_required;
  return 'We could not complete that request. Check your connection and try again.';
}
