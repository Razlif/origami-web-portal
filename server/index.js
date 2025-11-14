import './config/load-env.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import pagesRouter, { ensurePagesFile, initializePagesModule, readPagesFile } from './routes/pages.js';

const normalizeEnvironmentName = (candidate) => {
  if (!candidate) return '';

  let value = candidate.trim();
  if (!value) return '';

  let host = value;

  if (value.includes('://')) {
    try {
      host = new URL(value).hostname;
    } catch (error) {
      host = value.split('://')[1] ?? value;
    }
  }

  host = host.replace(/^https?:\/\//i, '');
  host = host.replace(/\/.*/, '');

  const origamiMatch = host.match(/^([^.]+)\.origami\.ms$/i);
  if (origamiMatch) {
    return origamiMatch[1].trim();
  }

  if (!host.includes('.')) {
    return host.trim();
  }

  return '';
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  ORIGAMI_ENVIRONMENT = '',
  ORIGAMI_BASE_URL: ORIGAMI_BASE_URL_LEGACY = '',
  ORIGAMI_USERNAME = '',
  ORIGAMI_API_KEY = '',
  PORT = 3001,
  PORTAL_ALLOWED_ORIGINS = 'http://localhost:5173',
  PORTAL_CACHE_DURATION = '60000',
  PORTAL_REFRESH_INTERVAL = '300000',
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  JWT_SECRET
} = process.env;

const ORIGAMI_ENVIRONMENT_NAME =
  normalizeEnvironmentName(ORIGAMI_ENVIRONMENT) || normalizeEnvironmentName(ORIGAMI_BASE_URL_LEGACY);

const ORIGAMI_BASE_URL = ORIGAMI_ENVIRONMENT_NAME
  ? `https://${ORIGAMI_ENVIRONMENT_NAME}.origami.ms/entities/api`
  : '';

if (!ORIGAMI_ENVIRONMENT_NAME || !ORIGAMI_USERNAME || !ORIGAMI_API_KEY) {
  console.warn(
    'Warning: Origami credentials are not fully configured. Please set ORIGAMI_ENVIRONMENT, ORIGAMI_USERNAME, and ORIGAMI_API_KEY in the server .env file.'
  );
}

if (!ORIGAMI_ENVIRONMENT && ORIGAMI_BASE_URL_LEGACY) {
  console.warn('ORIGAMI_BASE_URL is deprecated. Please switch to ORIGAMI_ENVIRONMENT.');
}

const allowedOrigins = PORTAL_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());

if (!JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not configured. Authentication will not work correctly.');
}

const app = express();

app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

const axiosClient = axios.create({
  baseURL: ORIGAMI_BASE_URL,
  headers: {
    Authorization: `Basic ${Buffer.from(`${ORIGAMI_USERNAME}:${ORIGAMI_API_KEY}`).toString('base64')}`
  }
});

const ensureOrigamiConfigured = () => {
  if (!ORIGAMI_BASE_URL) {
    const error = new Error('Origami environment is not configured. Set ORIGAMI_ENVIRONMENT in the server .env file.');
    error.code = 'ORIGAMI_CONFIG_MISSING';
    throw error;
  }
  if (!ORIGAMI_USERNAME || !ORIGAMI_API_KEY) {
    const error = new Error('Origami credentials are not configured. Provide ORIGAMI_USERNAME and ORIGAMI_API_KEY.');
    error.code = 'ORIGAMI_CONFIG_MISSING';
    throw error;
  }
};

const getAuthPayload = () => ({
  username: ORIGAMI_USERNAME,
  api_secret: ORIGAMI_API_KEY
});

const parseOrigamiPayload = (payload) => {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (error) {
      return payload;
    }
  }
  return payload;
};

const requestOrigami = async (endpoint, payload = {}) => {
  ensureOrigamiConfigured();
  const response = await axiosClient.post(endpoint, { ...getAuthPayload(), ...payload });
  const parsed = parseOrigamiPayload(response.data);
  if (parsed?.success && parsed.success !== 'ok') {
    const error = new Error(parsed?.message || `Origami request to ${endpoint} failed`);
    error.details = parsed;
    throw error;
  }
  return parsed;
};

const fetchEntitiesList = async () => {
  const payload = await requestOrigami('/entities_list/format/json');
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.results)) {
    return payload.results;
  }
  if (Array.isArray(payload?.entities)) {
    return payload.entities;
  }
  return [];
};

const fetchEntityStructureDetails = async (entityDataName) => {
  if (!entityDataName) {
    throw new Error('Entity data name is required to load Origami structure');
  }
  return await requestOrigami('/entity_structure/format/json', { entity_data_name: entityDataName });
};

const isTruthyFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['y', 'yes', 'true', '1'].includes(normalized);
  }
  return Boolean(value);
};

const normalizePossibleValues = (candidate) => {
  if (!candidate) return [];
  if (Array.isArray(candidate)) {
    return candidate
      .map((entry) => {
        if (entry == null) return null;
        if (typeof entry === 'string') {
          return { value: entry, label: entry };
        }
        if (typeof entry === 'object') {
          const value = entry.value ?? entry.id ?? entry.key;
          const label = entry.label ?? entry.name ?? entry.text;
          if (value == null) return null;
          return { value: String(value), label: label == null ? undefined : String(label) };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof candidate === 'object') {
    return Object.entries(candidate)
      .map(([value, label]) => ({ value, label: label == null ? undefined : String(label) }))
      .filter((entry) => entry.value != null);
  }
  if (typeof candidate === 'string') {
    return candidate
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
  }
  return [];
};

const coercePermissions = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const permissions = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!key) continue;
    const normalizedKey = key.replace(/^can[_-]?/i, '').trim();
    permissions[normalizedKey] = isTruthyFlag(value);
  }
  return permissions;
};

const collectGroupFields = (group) => {
  if (!group) return [];
  const raw = [];
  if (Array.isArray(group?.fields)) {
    raw.push(...group.fields);
  }
  if (Array.isArray(group?.fields_data)) {
    for (const row of group.fields_data) {
      if (!row) continue;
      if (Array.isArray(row)) {
        raw.push(...row);
      } else if (Array.isArray(row?.fields)) {
        raw.push(...row.fields);
      } else {
        raw.push(row);
      }
    }
  }
  if (Array.isArray(group?.field_group_fields)) {
    raw.push(...group.field_group_fields);
  }
  return raw.filter(Boolean);
};

const normalizeField = (field) => {
  if (!field || typeof field !== 'object') {
    return null;
  }
  const name = field.field_data_name ?? field.fieldDataName ?? field.data_name ?? field.dataName ?? field.name;
  if (!name) {
    return null;
  }
  const label = field.field_name ?? field.fieldName ?? field.label ?? name;
  const type = field.field_type_name ?? field.fieldTypeName ?? field.type ?? 'text';
  const hidden = isTruthyFlag(field.hidden ?? field.is_hidden ?? field.invisible);
  const options = normalizePossibleValues(field.field_possible_values ?? field.possible_values ?? field.options);
  const constraints =
    typeof field.validation_rules === 'object'
      ? field.validation_rules
      : typeof field.field_validations === 'object'
      ? field.field_validations
      : typeof field.constraints === 'object'
      ? field.constraints
      : undefined;

  return {
    name,
    dataName: name,
    label,
    type,
    hidden,
    options: options.length > 0 ? options : undefined,
    constraints
  };
};

const extractFieldGroups = (structure) => {
  if (Array.isArray(structure?.field_groups)) {
    return structure.field_groups;
  }
  if (Array.isArray(structure?.entity_structure?.field_groups)) {
    return structure.entity_structure.field_groups;
  }
  if (Array.isArray(structure?.instance_data)) {
    return structure.instance_data;
  }
  if (Array.isArray(structure?.entity_structure?.instance_data)) {
    return structure.entity_structure.instance_data;
  }
  return [];
};

const normalizeGroup = (group, index) => {
  const name =
    group?.group_name ??
    group?.groupName ??
    group?.field_group_name ??
    group?.fieldGroupName ??
    `Group ${index + 1}`;
  const dataName =
    group?.group_data_name ??
    group?.groupDataName ??
    group?.field_group_data_name ??
    group?.fieldGroupDataName ??
    name;
  const repeatable = isTruthyFlag(group?.repeatable ?? group?.is_repeatable ?? group?.repeatable_group);
  const permissions = coercePermissions(group?.permissions ?? group?.group_permissions ?? group?.groupPermissions);
  const fields = collectGroupFields(group)
    .map((field) => normalizeField(field))
    .filter(Boolean);

  return {
    name,
    dataName,
    repeatable,
    permissions,
    fields
  };
};

const normalizeEntityDefinition = (structure, fallbackLabel) => {
  const entityMeta =
    structure?.entity_data ??
    structure?.entity ??
    structure?.entity_structure?.entity_data ??
    structure?.entity_structure?.entity ??
    {};
  const groups = extractFieldGroups(structure).map((group, index) => normalizeGroup(group, index));
  const fieldsMap = new Map();
  for (const group of groups) {
    for (const field of group.fields) {
      if (!field?.name) continue;
      if (!fieldsMap.has(field.name)) {
        fieldsMap.set(field.name, field);
      }
    }
  }
  const fields = Array.from(fieldsMap.values()).sort((a, b) =>
    (a.label ?? a.name).localeCompare(b.label ?? b.name, undefined, { sensitivity: 'base' })
  );

  const name = entityMeta.entity_data_name ?? entityMeta.entityDataName ?? entityMeta.entity_name ?? fallbackLabel ?? '';
  const dataName = entityMeta.entity_data_name ?? entityMeta.entityDataName ?? name;
  const label = entityMeta.entity_name ?? entityMeta.entityName ?? fallbackLabel ?? name;

  return {
    name,
    dataName,
    label,
    groups,
    fields
  };
};

const normalizeRecordValue = (value, field) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return value;
  }

  if (Array.isArray(value)) {
    const flattened = value
      .map((entry) => normalizeRecordValue(entry, field))
      .filter((entry) => entry !== '' && entry !== undefined && entry !== null);
    if (flattened.length === 0) {
      return '';
    }
    if (flattened.length === 1) {
      return flattened[0];
    }
    return flattened.map((entry) => (typeof entry === 'number' ? entry.toString() : entry)).join(', ');
  }

  if (typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.formatted_address === 'string') {
      return value.formatted_address;
    }
    if (typeof value.value === 'string') {
      return value.value;
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'string' && field?.numeric) {
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }
  }

  return value;
};

const transformInstanceRecord = (entry) => {
  const aggregator = new Map();
  const groups = Array.isArray(entry?.instance_data?.field_groups) ? entry.instance_data.field_groups : [];

  for (const group of groups) {
    const rows = Array.isArray(group?.fields_data) ? group.fields_data : [];
    for (const row of rows) {
      const fields = Array.isArray(row) ? row : [row];
      for (const field of fields) {
        const key = field?.field_data_name;
        if (!key) continue;
        const normalized = normalizeRecordValue(field?.value ?? field?.default_value ?? '', field);
        if (!aggregator.has(key)) {
          aggregator.set(key, []);
        }
        aggregator.get(key).push(normalized);
      }
    }
  }

  const record = {};
  for (const [key, values] of aggregator.entries()) {
    const meaningful = values.filter((value) => value !== '' && value !== undefined && value !== null);
    const source = meaningful.length > 0 ? meaningful : values;
    if (source.length === 0) {
      record[key] = '';
    } else if (source.length === 1) {
      record[key] = source[0];
    } else {
      record[key] = source.map((value) => (typeof value === 'number' ? value.toString() : value)).join(', ');
    }
  }

  const metadata = entry?.instance_data ?? {};
  if (metadata._id && record._id === undefined) {
    record._id = metadata._id;
  }
  if (metadata.insertTimestamp && record.insertTimestamp === undefined) {
    record.insertTimestamp = metadata.insertTimestamp;
  }

  return record;
};

const dataDirectory = path.join(__dirname, 'data');
const structurePath = path.join(dataDirectory, 'structure.json');
const usersPath = path.join(dataDirectory, 'users.json');
const dataCache = new Map();
const cacheDuration = Number(PORTAL_CACHE_DURATION);

const ensureFile = async (filePath, defaultValue) => {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
  }
};

const readJsonFile = async (filePath, fallbackValue) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const clone = JSON.parse(JSON.stringify(fallbackValue));
      await fs.writeFile(filePath, JSON.stringify(clone, null, 2), 'utf-8');
      return clone;
    }
    throw error;
  }
};

const sanitizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const normalized = entry == null ? '' : String(entry).trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const loadUsers = async () => {
  const users = await readJsonFile(usersPath, []);
  if (!Array.isArray(users)) {
    return [];
  }
  return users.map((user) => ({
    ...user,
    allowedPages: sanitizeStringArray(user?.allowedPages ?? user?.allowed_pages)
  }));
};

const saveUsers = async (users) => {
  const normalized = users.map((user) => ({
    ...user,
    allowedPages: sanitizeStringArray(user?.allowedPages)
  }));
  await fs.writeFile(usersPath, JSON.stringify(normalized, null, 2), 'utf-8');
};

const sanitizeUser = (user) => {
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    allowedPages: sanitizeStringArray(user?.allowedPages ?? user?.allowed_pages)
  };
};

const bootstrapAdminUser = async () => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return;
  }

  const users = await loadUsers();
  const existing = users.find((candidate) => candidate.username === ADMIN_USERNAME);
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      existing.updatedAt = new Date().toISOString();
      await saveUsers(users);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const now = new Date().toISOString();
  const adminUser = {
    id: randomUUID(),
    username: ADMIN_USERNAME,
    role: 'admin',
    passwordHash,
    createdAt: now,
    updatedAt: now,
    allowedPages: []
  };
  await saveUsers([...users, adminUser]);
  console.log(`Bootstrapped admin user "${ADMIN_USERNAME}"`);
};

const ensureDataFiles = async () => {
  await ensureFile(structurePath, { entities: [] });
  await ensureFile(usersPath, []);
  await ensurePagesFile();
};

const readStructureFromFile = async () => {
  return await readJsonFile(structurePath, { entities: [] });
};

const writeStructureToFile = async (structure) => {
  await fs.writeFile(structurePath, JSON.stringify(structure, null, 2), 'utf-8');
};

const logStructureSummary = (structure, source = 'structure') => {
  const entities = Array.isArray(structure?.entities) ? structure.entities : [];
  if (entities.length === 0) {
    console.info(`Origami ${source} contains no entities.`);
    return;
  }
  console.info(`Origami ${source} summary:`);
  for (const entity of entities) {
    const fieldCount = Array.isArray(entity?.fields) ? entity.fields.length : 0;
    const label = entity?.label && entity.label !== entity.name ? `${entity.label} (${entity.name})` : entity?.name;
    console.info(`• ${label ?? 'Unknown entity'} – ${fieldCount} fields`);
    const groups = Array.isArray(entity?.groups) ? entity.groups : [];
    for (const group of groups) {
      const groupLabel = group?.name || group?.dataName || 'Group';
      const repeatable = group?.repeatable ? ' (repeatable)' : '';
      const fieldNames = Array.isArray(group?.fields)
        ? group.fields.map((field) => field?.label ?? field?.name).filter(Boolean)
        : [];
      const suffix = fieldNames.length > 0 ? ` → ${fieldNames.join(', ')}` : '';
      console.info(`   ↳ ${groupLabel}${repeatable}${suffix}`);
    }
  }
};

const fetchStructureFromOrigami = async () => {
  try {
    const entities = await fetchEntitiesList();
    const map = new Map();

    for (const entry of entities) {
      const entityDataName = entry?.entity_data_name ?? entry?.entityDataName;
      if (!entityDataName) continue;
      try {
        const structure = await fetchEntityStructureDetails(entityDataName);
        const normalized = normalizeEntityDefinition(structure, entry?.entity_name);
        if (normalized.name) {
          map.set(normalized.name, normalized);
        }
      } catch (error) {
        console.warn(`Failed to fetch structure for entity "${entityDataName}"`, error.response?.data || error.message);
      }
    }

    const structure = { entities: Array.from(map.values()) };
    await writeStructureToFile(structure);
    logStructureSummary(structure, 'structure fetch');
    return structure;
  } catch (error) {
    if (error.code === 'ORIGAMI_CONFIG_MISSING') {
      throw error;
    }
    console.warn('Falling back to legacy /structure endpoint due to Origami entity list error.', error.message);
    const response = await axiosClient.get('/structure');
    const structure = parseOrigamiPayload(response.data);
    await writeStructureToFile(structure);
    logStructureSummary(structure, 'legacy structure fetch');
    return structure;
  }
};

const createToken = (user) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
};

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const token = header.slice(7);
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server misconfiguration: missing JWT secret' });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const users = await loadUsers();
    const user = users.find((candidate) => candidate.id === payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Session expired' });
    }
    req.user = sanitizeUser(user);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    next(error);
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  next();
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const users = await loadUsers();
    const user = users.find((candidate) => candidate.username === username);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = createToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login failed', error);
    res.status(500).json({ message: 'Unable to log in' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/users', authenticate, requireAdmin, async (_req, res) => {
  const users = await loadUsers();
  res.json({ users: users.map(sanitizeUser) });
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body ?? {};
    const allowedPagesInput = req.body?.allowedPages ?? req.body?.allowed_pages;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const users = await loadUsers();
    if (users.some((candidate) => candidate.username === username)) {
      return res.status(409).json({ message: 'Username already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const newUser = {
      id: randomUUID(),
      username,
      role,
      passwordHash,
      createdAt: now,
      updatedAt: now,
      allowedPages: sanitizeStringArray(role === 'admin' ? [] : allowedPagesInput)
    };
    users.push(newUser);
    await saveUsers(users);
    res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (error) {
    console.error('Failed to create user', error);
    res.status(500).json({ message: 'Unable to create user' });
  }
});

app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body ?? {};
    const allowedPagesInput = req.body?.allowedPages ?? req.body?.allowed_pages;
    const users = await loadUsers();
    const index = users.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (username) {
      const duplicate = users.some(
        (candidate) => candidate.username === username && candidate.id !== id
      );
      if (duplicate) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      users[index].username = username;
    }
    if (role) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      users[index].role = role;
      if (role === 'admin') {
        users[index].allowedPages = [];
      }
    }
    if (allowedPagesInput !== undefined && users[index].role !== 'admin') {
      users[index].allowedPages = sanitizeStringArray(allowedPagesInput);
    }
    if (password) {
      users[index].passwordHash = await bcrypt.hash(password, 12);
    }
    users[index].updatedAt = new Date().toISOString();
    await saveUsers(users);
    res.json({ user: sanitizeUser(users[index]) });
  } catch (error) {
    console.error('Failed to update user', error);
    res.status(500).json({ message: 'Unable to update user' });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const users = await loadUsers();
    const index = users.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return res.status(404).json({ message: 'User not found' });
    }
    const candidate = users[index];
    if (
      candidate.role === 'admin' &&
      users.filter((entry) => entry.role === 'admin' && entry.id !== id).length === 0
    ) {
      return res.status(400).json({ message: 'Cannot remove the last admin user' });
    }
    users.splice(index, 1);
    await saveUsers(users);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete user', error);
    res.status(500).json({ message: 'Unable to delete user' });
  }
});

const fetchEntityData = async (entity) => {
  try {
    const payload = await requestOrigami('/instance_data/format/json', {
      entity_data_name: entity,
      page: 1,
      results_per_page: 200,
      max_each_page: 200
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((entry) => transformInstanceRecord(entry));
  } catch (error) {
    if (error.code === 'ORIGAMI_CONFIG_MISSING') {
      throw error;
    }
    console.warn(`Falling back to legacy data endpoint for entity "${entity}".`, error.message);
    const response = await axiosClient.get(`/data/${encodeURIComponent(entity)}`);
    return parseOrigamiPayload(response.data);
  }
};

const shouldUseCache = (entity) => {
  if (!dataCache.has(entity)) return false;
  const { timestamp } = dataCache.get(entity);
  return Date.now() - timestamp < cacheDuration;
};

const loadEntityData = async (entity) => {
  if (shouldUseCache(entity)) {
    return dataCache.get(entity).payload;
  }
  const data = await fetchEntityData(entity);
  dataCache.set(entity, { payload: data, timestamp: Date.now() });
  return data;
};

const findWidgetById = async (widgetId) => {
  if (!widgetId) {
    return null;
  }
  const pages = await readPagesFile();
  for (const page of pages) {
    const widget = page.widgets.find((entry) => entry.id === widgetId);
    if (widget) {
      return { widget: { ...widget, filters: Array.isArray(widget.filters) ? widget.filters : [] }, page };
    }
  }
  return null;
};

const dynamicTokenPattern = /^\{\{\s*(current_user\.[^{}\s]+)\s*\}\}$/i;

const getNestedValue = (source, path) => {
  if (!source || !path) {
    return undefined;
  }
  return path.split('.').reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, source);
};

const resolveFilterValue = (rawValue, context) => {
  if (typeof rawValue !== 'string') {
    return rawValue;
  }
  const match = rawValue.match(dynamicTokenPattern);
  if (!match) {
    return rawValue;
  }
  const tokenPath = match[1];
  if (tokenPath.toLowerCase().startsWith('current_user.')) {
    const userPath = tokenPath.slice('current_user.'.length);
    return getNestedValue(context.user, userPath);
  }
  return rawValue;
};

const asNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asString = (value) => {
  if (value == null) {
    return '';
  }
  return String(value);
};

const evaluateFilter = (recordValue, operator, targetValue) => {
  const recordNumber = asNumber(recordValue);
  const targetNumber = asNumber(targetValue);

  if (['>', '>=', '<', '<='].includes(operator)) {
    if (recordNumber == null || targetNumber == null) {
      return false;
    }
    switch (operator) {
      case '>':
        return recordNumber > targetNumber;
      case '>=':
        return recordNumber >= targetNumber;
      case '<':
        return recordNumber < targetNumber;
      case '<=':
        return recordNumber <= targetNumber;
      default:
        return false;
    }
  }

  if (recordNumber != null && targetNumber != null) {
    switch (operator) {
      case '!=':
        return recordNumber !== targetNumber;
      case '=':
        return recordNumber === targetNumber;
      default:
        break;
    }
  }

  const recordString = asString(recordValue).toLowerCase();
  const targetString = asString(targetValue).toLowerCase();

  switch (operator) {
    case '=':
      return recordString === targetString;
    case '!=':
      return recordString !== targetString;
    case 'contains':
      return recordString.includes(targetString);
    default:
      return false;
  }
};

const allowedWidgetTypes = new Set(['table', 'bar', 'line', 'pie']);
const allowedAggregations = new Set(['count', 'sum', 'avg']);
const allowedFilterOperators = new Set(['=', '!=', '>', '>=', '<', '<=', 'contains']);

const sanitizeWidgetConfig = (payload = {}) => {
  const type = allowedWidgetTypes.has(payload?.type) ? payload.type : 'table';
  const aggregation = allowedAggregations.has(payload?.aggregation) ? payload.aggregation : 'count';
  const fields = Array.isArray(payload?.fields)
    ? payload.fields.map((field) => (field == null ? '' : String(field).trim())).filter(Boolean)
    : [];
  const filters = Array.isArray(payload?.filters)
    ? payload.filters
        .map((filter) => {
          const field = filter?.field?.toString().trim();
          const operator = allowedFilterOperators.has(filter?.operator) ? filter.operator : '=';
          const rawValue = filter?.value;
          const value = rawValue == null ? '' : String(rawValue).trim();
          if (!field || !value) {
            return null;
          }
          return { field, operator, value };
        })
        .filter(Boolean)
    : [];

  return {
    id: payload?.id ?? '',
    title: payload?.title?.toString().trim() || 'Widget',
    type,
    entity: payload?.entity ?? '',
    fields,
    aggregation,
    x: Math.max(0, Math.round(Number(payload?.x ?? 0))),
    y: Math.max(0, Math.round(Number(payload?.y ?? 0))),
    w: Math.max(1, Math.min(12, Math.round(Number(payload?.w ?? 4)))),
    h: Math.max(1, Math.min(12, Math.round(Number(payload?.h ?? 4)))),
    filters
  };
};

const applyWidgetFilters = (records, filters = [], context) => {
  if (!Array.isArray(filters) || filters.length === 0) {
    return records;
  }
  return records.filter((record) => {
    return filters.every((filter) => {
      const field = filter?.field;
      const operator = filter?.operator ?? '=';
      if (!field) {
        return true;
      }
      const resolvedValue = resolveFilterValue(filter?.value, context);
      if (resolvedValue == null) {
        return false;
      }
      const recordValue = record?.[field];
      return evaluateFilter(recordValue, operator, resolvedValue);
    });
  });
};

app.use('/api/pages', authenticate, pagesRouter);

app.get('/api/connection/test', authenticate, requireAdmin, async (_req, res) => {
  try {
    await fetchEntitiesList();
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.response?.data || error.message
    });
  }
});

app.post('/api/structure/fetch', authenticate, requireAdmin, async (_req, res) => {
  try {
    const currentStructure = await readStructureFromFile();
    res.json(currentStructure);
    fetchStructureFromOrigami().catch((error) => {
      console.error('Background structure refresh failed', error.response?.data || error.message);
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch structure from Origami',
      details: error.response?.data || error.message
    });
  }
});

app.get('/api/structure', authenticate, async (_req, res) => {
  try {
    const structure = await readStructureFromFile();
    logStructureSummary(structure, 'structure read');
    res.json(structure);
  } catch (error) {
    res.status(500).json({
      message: 'Unable to read local structure file',
      details: error.message
    });
  }
});

app.get('/api/widgets/:widgetId/data', authenticate, async (req, res) => {
  try {
    const { widgetId } = req.params;
    const result = await findWidgetById(widgetId);
    if (!result) {
      return res.status(404).json({ message: 'Widget not found' });
    }
    const { widget } = result;
    if (!widget.entity) {
      return res.status(400).json({ message: 'Widget is missing an entity assignment' });
    }
    const data = await loadEntityData(widget.entity);
    const filtered = applyWidgetFilters(data, widget.filters, { user: req.user });
    res.json({
      widget: { id: widget.id, pageId: result.page.id },
      records: filtered
    });
  } catch (error) {
    console.error('Failed to load widget data', error);
    res.status(500).json({ message: 'Unable to load widget data' });
  }
});

app.post('/api/widgets/preview', authenticate, async (req, res) => {
  try {
    const widget = sanitizeWidgetConfig(req.body ?? {});
    if (!widget.entity) {
      return res.status(400).json({ message: 'Widget entity is required' });
    }
    const data = await loadEntityData(widget.entity);
    const filtered = applyWidgetFilters(data, widget.filters, { user: req.user });
    res.json({ records: filtered });
  } catch (error) {
    console.error('Failed to generate widget preview', error);
    res.status(500).json({ message: 'Unable to generate widget preview' });
  }
});

app.get('/api/data/:entity', authenticate, async (req, res) => {
  const { entity } = req.params;
  try {
    const data = await loadEntityData(entity);
    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: `Failed to fetch data for entity ${entity}`,
      details: error.response?.data || error.message
    });
  }
});

app.post('/api/data/:entity/refresh', authenticate, requireAdmin, async (req, res) => {
  const { entity } = req.params;
  try {
    const data = await fetchEntityData(entity);
    dataCache.set(entity, { payload: data, timestamp: Date.now() });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      message: `Failed to refresh data for entity ${entity}`,
      details: error.response?.data || error.message
    });
  }
});

app.post('/api/data/refresh-all', authenticate, requireAdmin, async (_req, res) => {
  dataCache.clear();
  res.json({ status: 'cleared' });
});

const distPath = path.join(__dirname, 'client', 'dist');
const distIndexFile = path.join(distPath, 'index.html');
const isProduction = process.env.NODE_ENV === 'production';
const hasFrontendBuild = existsSync(distIndexFile);

if (hasFrontendBuild) {
  console.log('✅ Frontend build found at client/dist');
} else if (isProduction) {
  console.warn('⚠️ No build found — run npm run build first');
}

if (isProduction) {
  if (hasFrontendBuild) {
    app.use(express.static(path.join(__dirname, 'client', 'dist')));
    app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html')));
  } else {
    app.get('*', (_req, res) => {
      res.status(503).send('Frontend not built yet. Run `npm run build` first.');
    });
  }
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message });
});

const start = async () => {
  try {
    await ensureDataFiles();
    await initializePagesModule();
    await bootstrapAdminUser();
    app.listen(PORT, () => {
      console.log(`Origami proxy listening on port ${PORT}`);
      console.log(`Data refresh interval set to ${PORTAL_REFRESH_INTERVAL}ms`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

start();
