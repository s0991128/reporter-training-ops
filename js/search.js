export function matchesTaskSearch(task, query) {
  const searchable = [task.title, task.description, task.caution].join(' ').toLowerCase();
  return searchable.includes(query.trim().toLowerCase());
}
