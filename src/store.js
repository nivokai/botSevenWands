const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'db.json');

function defaults() {
  return {
    nextId: Number(process.env.START_ID) || 1,
    courses: [],
    salles: [],
    config: {
      planningChannelId: null,
      planningMessageIds: [],
      historyChannelId: null,
      historyMessages: {}, // { 'YYYY-MM-DD': [messageId, ...] }
      profRoleId: null,
    },
  };
}

function load() {
  if (!fs.existsSync(FILE)) return defaults();
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const base = defaults();
  return { ...base, ...data, config: { ...base.config, ...data.config } };
}

const db = load();

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function addCourse(course) {
  const c = { id: db.nextId++, ...course, createdAt: Math.floor(Date.now() / 1000) };
  db.courses.push(c);
  save();
  return c;
}

function getCourse(id) {
  return db.courses.find((c) => c.id === id) || null;
}

function removeCourse(id) {
  const idx = db.courses.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const [removed] = db.courses.splice(idx, 1);
  save();
  return removed;
}

function findSalle(nom) {
  const n = nom.trim().toLowerCase();
  return db.salles.find((s) => s.toLowerCase() === n) || null;
}

module.exports = { db, save, addCourse, getCourse, removeCourse, findSalle };
