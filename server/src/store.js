const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDirectory, 'wms.json');

const defaultData = {
  paperStock: [],
  adhesiveKg: 0,
  orders: [],
  nextOrderId: 1
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
  }

  const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  return { ...clone(defaultData), ...stored };
}

let data = loadData();

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function readData() {
  return clone(data);
}

function updateData(updater) {
  updater(data);
  saveData();
  return readData();
}

module.exports = { readData, updateData };
