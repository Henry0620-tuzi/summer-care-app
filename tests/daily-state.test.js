const assert = require('node:assert/strict');
const Daily = require('../daily-state.js');

function sampleState() {
  return {
    planDate: '2026-07-15',
    dailyRecords: [],
    plans: {
      today: [
        { id: 1, title: '已完成阅读', meta: '语文 · 20分钟', points: 10, done: true },
        { id: 2, title: '未完成运动', meta: '运动 · 30分钟', points: 15, done: false }
      ],
      tomorrow: [{ id: 3, title: '明日写字', meta: '语文 · 15分钟', points: 10, done: false }],
      later: [{ id: 4, title: '后日实验', meta: '科学 · 25分钟', points: 20, done: false }]
    }
  };
}

{
  const state = sampleState();
  const result = Daily.rollForward(state, '2026-07-16');
  assert.deepEqual(result, { rolledDays: 1, carriedTasks: 1 });
  assert.equal(state.planDate, '2026-07-16');
  assert.deepEqual(state.plans.today.map(task => task.id), [2, 3]);
  assert.equal(state.plans.today[0].meta, '补做 · 运动 · 30分钟');
  assert.deepEqual(state.plans.tomorrow.map(task => task.id), [4]);
  assert.deepEqual(state.plans.later, []);
  assert.deepEqual(state.dailyRecords.find(item => item.date === '2026-07-15'), {
    date: '2026-07-15', completed: 1, total: 2, minutes: 20, earnedPoints: 10
  });
}

{
  const state = sampleState();
  Daily.rollForward(state, '2026-07-18');
  assert.equal(state.planDate, '2026-07-18');
  assert.equal(state.plans.today.length, 3);
  assert.equal(state.plans.today.every(task => task.done === false), true);
  assert.equal(state.plans.today[0].meta.startsWith('补做 · 补做'), false);
}

{
  const records = [
    { completed: 1 }, { completed: 0 }, { completed: 2 }, { completed: 1 }, { completed: 3 }, { completed: 1 }, { completed: 0 }
  ];
  assert.equal(Daily.streak(records), 4);
  assert.equal(Daily.streak([{ completed: 1 }, { completed: 0 }]), 1);
  assert.equal(Daily.streak([{ completed: 0 }, { completed: 0 }]), 0);
}

{
  const state = sampleState();
  state.planDate = '2026-07-16';
  state.dailyRecords = [{ date: '2026-07-15', completed: 1, total: 2, minutes: 20, earnedPoints: 10 }];
  const records = Daily.recentRecords(state, 3, '2026-07-16');
  assert.deepEqual(records.map(item => item.date), ['2026-07-14', '2026-07-15', '2026-07-16']);
  assert.equal(records[1].completed, 1);
  assert.equal(records[2].completed, 1);
}

console.log('daily-state tests passed');
