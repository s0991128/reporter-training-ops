export function matchesTaskSearch(task, query) {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const searchable = [task.title, task.description, task.category, ...tags, task.handover?.caution, task.handover?.knowhow].filter(Boolean).join(' ').toLowerCase();
  return searchable.includes(query.trim().toLowerCase());
}
