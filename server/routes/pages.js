import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.join(__dirname, '..', 'data');
const pagesPath = path.join(dataDirectory, 'pages.json');

const router = Router();

const ensurePagesFile = async () => {
  try {
    await fs.access(pagesPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    await fs.mkdir(path.dirname(pagesPath), { recursive: true });
    await fs.writeFile(pagesPath, '[]\n', 'utf-8');
  }
};

const readPagesFile = async () => {
  await ensurePagesFile();
  const raw = await fs.readFile(pagesPath, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse pages.json — resetting file', error);
    await fs.writeFile(pagesPath, '[]\n', 'utf-8');
    return [];
  }
};

const writePagesFile = async (pages) => {
  await fs.writeFile(pagesPath, `${JSON.stringify(pages, null, 2)}\n`, 'utf-8');
};

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const allowedWidgetTypes = new Set(['table', 'bar', 'line', 'pie']);
const allowedAggregations = new Set(['count', 'sum', 'avg']);
const allowedFilterOperators = new Set(['=', '!=', '>', '>=', '<', '<=', 'contains']);

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (entry == null ? '' : String(entry).trim()))
    .filter(Boolean);
};

const sanitizeFilters = (filters) => {
  if (!Array.isArray(filters)) {
    return [];
  }
  return filters
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
    .filter(Boolean);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sanitizeWidget = (widget) => {
  const type = allowedWidgetTypes.has(widget?.type) ? widget.type : 'table';
  const aggregation = allowedAggregations.has(widget?.aggregation) ? widget.aggregation : 'count';
  return {
    id: widget?.id ?? '',
    title: widget?.title?.toString().trim() || 'Widget',
    type,
    entity: widget?.entity ?? '',
    fields: normalizeStringArray(widget?.fields),
    aggregation,
    x: Math.max(0, Math.round(normalizeNumber(widget?.x, 0))),
    y: Math.max(0, Math.round(normalizeNumber(widget?.y, 0))),
    w: clamp(Math.round(normalizeNumber(widget?.w, 4)), 1, 12),
    h: clamp(Math.round(normalizeNumber(widget?.h, 4)), 1, 12),
    filters: sanitizeFilters(widget?.filters)
  };
};

const sanitizePage = (page) => ({
  id: page?.id ?? '',
  name: page?.name?.toString().trim() || 'Page',
  published: Boolean(page?.published),
  widgets: Array.isArray(page?.widgets) ? page.widgets.map(sanitizeWidget) : []
});

const logPagesSummary = (pages, context) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const header = context ? `Pages snapshot (${context})` : 'Pages snapshot';
  console.groupCollapsed(header);
  if (pages.length === 0) {
    console.log('• No pages defined');
  }
  for (const page of pages) {
    console.log(`• ${page.name} [${page.published ? 'Published' : 'Draft'}] — ${page.widgets.length} widget(s)`);
    for (const widget of page.widgets) {
      console.log(
        `   ↳ ${widget.title} · ${widget.type.toUpperCase()} · ${widget.aggregation?.toUpperCase?.() ?? 'COUNT'} @ (${widget.x}, ${widget.y}) ${widget.w}×${widget.h}`
      );
    }
  }
  console.groupEnd();
};

export const initializePagesModule = async () => {
  await ensurePagesFile();
  const pages = await readPagesFile();
  console.log('✅ Pages module initialized');
  console.log(`Loaded ${pages.length} pages from data/pages.json`);
  logPagesSummary(pages, 'initial state');
  return pages;
};

router.get('/', async (req, res) => {
  try {
    const pages = await readPagesFile();
    logPagesSummary(pages, 'GET /api/pages');

    const user = req.user;
    if (user && user.role !== 'admin') {
      const allowed = new Set(normalizeStringArray(user.allowedPages));
      if (allowed.size === 0) {
        return res.json([]);
      }
      const visible = pages.filter((page) => allowed.has(page.id) && page.published);
      return res.json(visible);
    }

    res.json(pages);
  } catch (error) {
    console.error('Failed to read pages.json', error);
    res.status(500).json({ message: 'Unable to read pages configuration' });
  }
});

router.post('/', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  try {
    const payload = Array.isArray(req.body) ? req.body : req.body?.pages;
    if (!Array.isArray(payload)) {
      return res.status(400).json({ message: 'Expected an array of pages' });
    }
    const pages = payload.map(sanitizePage);
    await ensurePagesFile();
    await writePagesFile(pages);
    console.log(`💾 Saved ${pages.length} pages to data/pages.json`);
    logPagesSummary(pages, 'POST /api/pages');
    res.json({ pages });
  } catch (error) {
    console.error('Failed to persist pages.json', error);
    res.status(500).json({ message: 'Unable to save pages configuration' });
  }
});

router.post('/:id/publish', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }

  try {
    const pageId = req.params.id;
    if (!pageId) {
      return res.status(400).json({ message: 'Page id is required' });
    }
    const pages = await readPagesFile();
    let updatedPage = null;
    const nextPages = pages.map((page) => {
      if (page.id !== pageId) {
        return page;
      }
      updatedPage = { ...page, published: true };
      return updatedPage;
    });

    if (!updatedPage) {
      return res.status(404).json({ message: 'Page not found' });
    }

    await ensurePagesFile();
    await writePagesFile(nextPages);
    console.log(`🚀 Published page "${updatedPage.name}" via API`);
    logPagesSummary(nextPages, 'POST /api/pages/:id/publish');
    res.json({ page: updatedPage, pages: nextPages });
  } catch (error) {
    console.error('Failed to publish dashboard page', error);
    res.status(500).json({ message: 'Unable to publish page' });
  }
});

router.post('/:id/unpublish', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }

  try {
    const pageId = req.params.id;
    if (!pageId) {
      return res.status(400).json({ message: 'Page id is required' });
    }
    const pages = await readPagesFile();
    let updatedPage = null;
    const nextPages = pages.map((page) => {
      if (page.id !== pageId) {
        return page;
      }
      updatedPage = { ...page, published: false };
      return updatedPage;
    });

    if (!updatedPage) {
      return res.status(404).json({ message: 'Page not found' });
    }

    await ensurePagesFile();
    await writePagesFile(nextPages);
    console.log(`�?'� Unpublished page "${updatedPage.name}" via API`);
    logPagesSummary(nextPages, 'POST /api/pages/:id/unpublish');
    res.json({ page: updatedPage, pages: nextPages });
  } catch (error) {
    console.error('Failed to unpublish dashboard page', error);
    res.status(500).json({ message: 'Unable to unpublish page' });
  }
});

export { ensurePagesFile, pagesPath, readPagesFile };
export default router;
