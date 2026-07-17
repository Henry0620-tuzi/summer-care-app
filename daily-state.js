(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SummerCareDaily = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function shiftDateKey(value, days) {
    const date = parseDateKey(value);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function estimateMinutes(task) {
    const match = String(task?.meta || '').match(/(\d+)\s*分钟/);
    if (match) return Number(match[1]);
    return task?.done ? 20 : 0;
  }

  function summarizeDay(day, tasks = []) {
    const completedTasks = tasks.filter(task => task.done);
    return {
      date: day,
      completed: completedTasks.length,
      total: tasks.length,
      minutes: completedTasks.reduce((sum, task) => sum + estimateMinutes(task), 0),
      earnedPoints: completedTasks.reduce((sum, task) => sum + (Number(task.points) || 0), 0)
    };
  }

  function upsertRecord(records, record) {
    const next = (records || []).filter(item => item.date !== record.date);
    next.push(record);
    return next.sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
  }

  function refreshToday(state, today = dateKey()) {
    state.dailyRecords = upsertRecord(state.dailyRecords, summarizeDay(today, state.plans?.today || []));
    return state;
  }

  function rollForward(state, today = dateKey()) {
    state.plans ||= { today: [], tomorrow: [], later: [] };
    state.plans.today ||= [];
    state.plans.tomorrow ||= [];
    state.plans.later ||= [];
    state.dailyRecords ||= [];
    state.planDate ||= today;

    if (state.planDate > today) state.planDate = today;
    let rolledDays = 0;
    let carriedTasks = 0;

    while (state.planDate < today && rolledDays < 366) {
      state.dailyRecords = upsertRecord(state.dailyRecords, summarizeDay(state.planDate, state.plans.today));
      const overdue = state.plans.today.filter(task => !task.done).map(task => ({
        ...task,
        done: false,
        overdueFrom: task.overdueFrom || state.planDate,
        meta: String(task.meta || '').startsWith('补做 · ') ? task.meta : `补做 · ${task.meta || '未完成计划'}`
      }));
      carriedTasks += overdue.length;
      state.plans.today = [...overdue, ...state.plans.tomorrow];
      state.plans.tomorrow = state.plans.later;
      state.plans.later = [];
      state.planDate = shiftDateKey(state.planDate, 1);
      rolledDays += 1;
    }

    refreshToday(state, today);
    return { rolledDays, carriedTasks };
  }

  function recentRecords(state, days = 7, today = dateKey()) {
    const byDate = new Map((state.dailyRecords || []).map(item => [item.date, item]));
    byDate.set(today, summarizeDay(today, state.plans?.today || []));
    return Array.from({ length: days }, (_, index) => {
      const day = shiftDateKey(today, index - days + 1);
      return byDate.get(day) || { date: day, completed: 0, total: 0, minutes: 0, earnedPoints: 0 };
    });
  }

  function streak(records) {
    let count = 0;
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (index === records.length - 1 && record.completed === 0) continue;
      if (record.completed <= 0) break;
      count += 1;
    }
    return count;
  }

  return { dateKey, shiftDateKey, summarizeDay, refreshToday, rollForward, recentRecords, streak };
});
