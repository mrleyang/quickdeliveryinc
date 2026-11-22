const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT UNIQUE NOT NULL,
      sender_name TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      package_type TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'En préparation',
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser({ name, email, passwordHash, role = 'user' }) {
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name, email, passwordHash, role);

  return getUserById(result.lastInsertRowid);
}

function createShipment({ trackingNumber, senderName, recipientName, origin, destination, packageType, weightKg, userId }) {
  const result = db.prepare(
    'INSERT INTO shipments (tracking_number, sender_name, recipient_name, origin, destination, package_type, weight_kg, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(trackingNumber, senderName, recipientName, origin, destination, packageType, Number(weightKg), userId);

  return db.prepare('SELECT * FROM shipments WHERE id = ?').get(result.lastInsertRowid);
}

function getShipmentsForUser(userId) {
  return db.prepare(
    'SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
}

function getAllShipments() {
  return db.prepare(
    `SELECT s.*, u.name as user_name, u.email as user_email
     FROM shipments s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC`
  ).all();
}

function updateShipmentStatus(id, status) {
  return db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, id);
}

function getShipmentByTracking(trackingNumber) {
  return db.prepare(
    `SELECT s.*, u.name as user_name, u.email as user_email
     FROM shipments s
     JOIN users u ON u.id = s.user_id
     WHERE s.tracking_number = ?`
  ).get(trackingNumber.toUpperCase());
}

function seedDatabase() {
  const admin = getUserByEmail('admin@fedexclone.test');
  if (!admin) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    createUser({
      name: 'Admin QuickDeveleryInc',
      email: 'admin@fedexclone.test',
      passwordHash: adminHash,
      role: 'admin',
    });
  }

  const demoUser = getUserByEmail('client@fedexclone.test');
  if (!demoUser) {
    const demoHash = bcrypt.hashSync('client123', 10);
    const user = createUser({
      name: 'Client Demo',
      email: 'client@fedexclone.test',
      passwordHash: demoHash,
      role: 'user',
    });

    createShipment({
      trackingNumber: 'EP240001',
      senderName: 'Atelier Lab',
      recipientName: 'Marie Dupont',
      origin: 'Paris',
      destination: 'Lyon',
      packageType: 'Colis standard',
      weightKg: 4.5,
      userId: user.id,
    });

    createShipment({
      trackingNumber: 'EP240002',
      senderName: 'Boutique Nord',
      recipientName: 'Thomas Martin',
      origin: 'Marseille',
      destination: 'Bordeaux',
      packageType: 'Colis express',
      weightKg: 2.8,
      userId: user.id,
    });
  }
}

module.exports = {
  initDatabase,
  seedDatabase,
  createUser,
  getUserByEmail,
  getUserById,
  createShipment,
  getShipmentsForUser,
  getAllShipments,
  updateShipmentStatus,
  getShipmentByTracking,
};
