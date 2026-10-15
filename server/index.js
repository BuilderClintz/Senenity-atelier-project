import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(rootDirectory, '..');
const buildDirectory = path.join(projectDirectory, 'dist');
const measurementKeys = ['bust', 'waist', 'hips', 'shoulder', 'sleeve', 'dressLength'];

const measurementSchema = new mongoose.Schema({
  bust: { type: String, default: '' },
  waist: { type: String, default: '' },
  hips: { type: String, default: '' },
  shoulder: { type: String, default: '' },
  sleeve: { type: String, default: '' },
  dressLength: { type: String, default: '' },
}, { _id: false });

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  service: { type: String, trim: true, maxlength: 80, default: 'Evening wear' },
  nextFitting: { type: String, default: '' },
  image: { type: String, maxlength: 5_500_000, default: '' },
  notes: { type: String, maxlength: 3000, default: '' },
  measurements: { type: measurementSchema, default: () => ({}) },
}, {
  timestamps: true,
  bufferCommands: false,
  toJSON: {
    virtuals: true,
    transform(_document, record) {
      record.id = record._id.toString();
      delete record._id;
      delete record.__v;
      return record;
    },
  },
});

const Client = mongoose.model('Client', clientSchema);

app.use(express.json({ limit: '8mb' }));

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function requireDatabase(_request, response, next) {
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({ error: 'MongoDB is not connected. Add MONGODB_URI to .env and restart the app.' });
  }
  next();
}

function normalizeClient(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw Object.assign(new Error('Client name is required.'), { status: 400 });
  if (name.length > 120) throw Object.assign(new Error('Client name must be 120 characters or fewer.'), { status: 400 });
  if (/[\u0000-\u001f\u007f]/.test(name)) throw Object.assign(new Error('Client name contains unsupported characters.'), { status: 400 });

  const image = typeof body.image === 'string' ? body.image : '';
  if (image.length > 5_500_000) throw Object.assign(new Error('Photo is too large. Choose a smaller image.'), { status: 413 });

  const measurements = {};
  for (const key of measurementKeys) {
    const value = String(body.measurements?.[key] ?? '').trim();
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw Object.assign(new Error(`${key} must be a non-negative number.`), { status: 400 });
    }
    measurements[key] = value;
  }

  return {
    name,
    email: typeof body.email === 'string' ? body.email.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    service: typeof body.service === 'string' ? body.service.trim() : 'Evening wear',
    nextFitting: typeof body.nextFitting === 'string' ? body.nextFitting : '',
    image,
    notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    measurements,
  };
}

function createMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

async function emailMeasurements(client, action) {
  const transporter = createMailer();
  const recipient = process.env.MEASUREMENT_EMAIL_TO;
  if (!transporter || !recipient) return { status: 'not_configured' };

  const labels = {
    bust: 'Bust', waist: 'Waist', hips: 'Hips', shoulder: 'Shoulder', sleeve: 'Sleeve', dressLength: 'Dress length',
  };
  const measurementLines = measurementKeys.map((key) => `${labels[key]}: ${client.measurements?.[key] || 'Not provided'} inches`);

  try {
    await transporter.sendMail({
      from: process.env.MEASUREMENT_EMAIL_FROM || process.env.SMTP_USER,
      to: recipient,
      subject: `Client measurements ${action}: ${client.name}`,
      text: [
        `Client measurements were ${action} in Senenity Atelier.`,
        '',
        `Client: ${client.name}`,
        `Commission: ${client.service || 'Not provided'}`,
        `Next fitting: ${client.nextFitting || 'Not scheduled'}`,
        '',
        'Measurements (inches)',
        ...measurementLines,
      ].join('\n'),
    });
    return { status: 'sent' };
  } catch (error) {
    console.error('Measurement email could not be sent:', error.message);
    return { status: 'failed' };
  }
}

app.get('/api/health', (_request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  response.status(databaseConnected ? 200 : 503).json({
    database: databaseConnected ? 'connected' : 'disconnected',
    emailConfigured: Boolean(createMailer() && process.env.MEASUREMENT_EMAIL_TO),
  });
});

app.use('/api/clients', requireDatabase);

app.get('/api/clients', asyncRoute(async (_request, response) => {
  const clients = await Client.find().sort({ updatedAt: -1 });
  response.json({ clients: clients.map((client) => client.toJSON()) });
}));

app.post('/api/clients', asyncRoute(async (request, response) => {
  const client = await Client.create(normalizeClient(request.body));
  const email = await emailMeasurements(client, 'created');
  response.status(201).json({ client: client.toJSON(), email });
}));

app.put('/api/clients/:id', asyncRoute(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ error: 'Invalid client record ID.' });
  }
  const client = await Client.findByIdAndUpdate(request.params.id, normalizeClient(request.body), {
    new: true,
    runValidators: true,
  });
  if (!client) return response.status(404).json({ error: 'Client record not found.' });
  const email = await emailMeasurements(client, 'updated');
  response.json({ client: client.toJSON(), email });
}));

app.delete('/api/clients/:id', asyncRoute(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    return response.status(400).json({ error: 'Invalid client record ID.' });
  }
  const client = await Client.findByIdAndDelete(request.params.id);
  if (!client) return response.status(404).json({ error: 'Client record not found.' });
  response.status(204).end();
}));

if (existsSync(buildDirectory)) {
  app.use(express.static(buildDirectory));
  app.get('*', (_request, response) => response.sendFile(path.join(buildDirectory, 'index.html')));
}

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error.message);
  response.status(error.status || 500).json({
    error: error.status ? error.message : 'The request could not be completed.',
  });
});

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.info('Connected to MongoDB.'))
    .catch((error) => console.error('MongoDB connection failed:', error.message));
} else {
  console.warn('MongoDB is not configured. Copy .env.example to .env and set MONGODB_URI.');
}

app.listen(port, host, () => console.info(`Senenity Atelier API listening at http://${host}:${port}.`));