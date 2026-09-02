export const STAGES = ['사전준비', '교육운영', '종료처리', '정산', '결과보고'];

export function getStats(tasks, state) {
  const complete = tasks.filter(task => state[task.id]?.completed).length;
  return { total:tasks.length, complete, pending:tasks.length - complete, progress:tasks.filter(task => state[task.id]?.started && !state[task.id]?.completed).length };
}

export function renderDashboard(tasks, state) {
  const stats = getStats(tasks, state);
  const percent = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;
  document.querySelector('#total-count').textContent = stats.total;
  document.querySelector('#complete-count').textContent = stats.complete;
  document.querySelector('#progress-count').textContent = stats.progress;
  document.querySelector('#pending-count').textContent = stats.pending - stats.progress;
  document.querySelector('#progress-percent').textContent = `${percent}%`;
  document.querySelector('#overall-progress').style.width = `${percent}%`;
  document.querySelector('#progress-caption').textContent = stats.complete ? `${stats.complete}개 업무를 완료했습니다.` : '첫 업무를 완료하면 진행률이 표시됩니다.';
  document.querySelector('#all-tab-count').textContent = stats.total;
  document.querySelector('#stage-progress').innerHTML = STAGES.map(stage => {
    const stageTasks = tasks.filter(task => task.stage === stage);
    const done = stageTasks.filter(task => state[task.id]?.completed).length;
    const stagePercent = stageTasks.length ? Math.round(done / stageTasks.length * 100) : 0;
    return `<button class="stage-item" data-stage="${stage}"><div class="stage-top"><strong>${stage}</strong><span>${done}/${stageTasks.length}</span></div><div class="stage-track"><span style="width:${stagePercent}%"></span></div></button>`;
  }).join('');
  return stats;
}
