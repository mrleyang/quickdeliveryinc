const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');

const {
  initDatabase,
  seedDatabase,
  createUser,
  getUserByEmail,
  createShipment,
  getShipmentsForUser,
  getAllShipments,
  updateShipmentStatus,
  getShipmentByTracking,
  getUserById,
} = require('./data/database');

const app = express();
const PORT = process.env.PORT || 3000;

const formatDate = (value) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
};

const statusLabels = {
  'En préparation': 'Preparing',
  'Expédié': 'Shipped',
  'En transit': 'In transit',
  'Livré': 'Delivered',
  'Retardé': 'Delayed',
};

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login?error=Please sign in to continue');
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login?error=Administrator access only');
  }
  next();
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'quickdeveleryinc-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.formatDate = formatDate;
  res.locals.statusLabel = (status) => statusLabels[status] || status || 'Unknown';
  next();
});

app.get('/', (req, res) => {
  const stats = [
    { label: 'Deliveries completed', value: '2.4M+' },
    { label: 'Countries served', value: '220' },
    { label: 'Average delivery', value: '< 48h' },
  ];

  res.render('index', {
    title: 'QuickDeveleryInc | Fast, reliable delivery',
    stats,
  });
});

app.get('/register', (req, res) => {
  res.render('register', { title: 'Create an account', error: req.query.error || '' });
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.redirect('/register?error=All fields are required');
  }

  if (password.length < 6) {
    return res.redirect('/register?error=Password must be at least 6 characters');
  }

  const existingUser = getUserByEmail(email.trim().toLowerCase());
  if (existingUser) {
    return res.redirect('/register?error=An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: 'user',
  });

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  res.redirect('/dashboard');
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Sign in', error: req.query.error || '' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.redirect('/login?error=Email and password are required');
  }

  const user = getUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return res.redirect('/login?error=Incorrect email or password');
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.redirect('/login?error=Incorrect email or password');
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  if (user.role === 'admin') {
    return res.redirect('/admin');
  }

  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  const shipments = getShipmentsForUser(req.session.user.id);
  const currentUser = getUserById(req.session.user.id);

  res.render('dashboard', {
    title: 'Customer dashboard',
    user: currentUser,
    shipments,
  });
});

app.post('/shipments/create', requireAuth, (req, res) => {
  const { senderName, recipientName, origin, destination, packageType, weightKg } = req.body;

  if (!senderName || !recipientName || !origin || !destination || !packageType || !weightKg) {
    return res.redirect('/dashboard?error=Please complete every shipment field');
  }

  const trackingNumber = `EP${Date.now().toString().slice(-8)}`;

  createShipment({
    trackingNumber,
    senderName: senderName.trim(),
    recipientName: recipientName.trim(),
    origin: origin.trim(),
    destination: destination.trim(),
    packageType: packageType.trim(),
    weightKg: Number(weightKg),
    userId: req.session.user.id,
  });

  res.redirect('/dashboard?success=Your shipment has been created');
});

app.get('/admin', requireAdmin, (req, res) => {
  const shipments = getAllShipments();
  res.render('admin', {
    title: 'Administrator dashboard',
    shipments,
    success: req.query.success || '',
    error: req.query.error || '',
  });
});

app.post('/admin/users', requireAdmin, async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const normalizedEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name || !normalizedEmail || !password) {
    return res.redirect('/admin?error=' + encodeURIComponent('All fields are required'));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.redirect('/admin?error=' + encodeURIComponent('Enter a valid email address'));
  }

  if (password.length < 8) {
    return res.redirect('/admin?error=' + encodeURIComponent('Admin passwords must be at least 8 characters'));
  }

  if (getUserByEmail(normalizedEmail)) {
    return res.redirect('/admin?error=' + encodeURIComponent('An account with this email already exists'));
  }

  const passwordHash = await bcrypt.hash(password, 10);
  createUser({
    name,
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
  });

  res.redirect('/admin?success=' + encodeURIComponent('Administrator account created'));
});

app.post('/admin/status/:id', requireAdmin, (req, res) => {
  const shipmentId = Number(req.params.id);
  const { status } = req.body;

  if (!status) {
    return res.redirect('/admin?error=Invalid status');
  }

  updateShipmentStatus(shipmentId, status);
  res.redirect('/admin?success=Status updated');
});

app.get('/track', (req, res) => {
  const trackingNumber = (req.query.q || '').trim().toUpperCase();

  if (!trackingNumber) {
    return res.redirect('/');
  }

  const shipment = getShipmentByTracking(trackingNumber);

  res.render('track', {
    title: 'Shipment tracking',
    trackingNumber,
    shipment,
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'QuickDeveleryInc API is running' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

initDatabase();
seedDatabase();

app.listen(PORT, () => {
  console.log(`QuickDeveleryInc running at http://localhost:${PORT}`);
});
