# Routine run log setup (one time)
If you have NO routines: do nothing, don't reply.
If you have routines, for each one:
1. Register it once:
   /workspace/grugbot-console/register.sh '<your bot name>' '<your bot id>' '<routine id>' '<routine name>' '<schedule or trigger>' '<one-line purpose>'
2. Update that routine's prompt (UpdateRoutine update, prompt only) to add this as its final step:
   Run /workspace/grugbot-console/log-run.sh '<your bot name>' '<routine id>' ok|error|skipped '<one-line summary of what you did>'
   No secrets, tokens, or personal data in the summary. Change nothing else in the routine.
