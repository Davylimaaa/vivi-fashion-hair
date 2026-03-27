const express = require('express')
const session = require('express-session')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_PRODUCTION = NODE_ENV === 'production'
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const HAS_CROSS_ORIGIN = FRONTEND_ORIGINS.length > 0
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vivis2026'
const PERSISTENT_ROOT = process.env.RENDER_DISK_PATH || process.env.STORAGE_ROOT || ''
const DATA_DIR = PERSISTENT_ROOT ? path.join(PERSISTENT_ROOT, 'data') : path.join(__dirname, 'data')
const UPLOADS_DIR = PERSISTENT_ROOT ? path.join(PERSISTENT_ROOT, 'images') : path.join(__dirname, 'images')
const BUNDLED_IMAGES_DIR = path.join(__dirname, 'images')

// --- Data file ---
const DATA_FILE = path.join(DATA_DIR, 'data.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const SITE_IMAGE_DEFAULTS = {
  capa: 'images/capa.png',
  sobrenos: 'images/sobrenos.png',
  antes: 'images/antes.jpeg',
  depois: 'images/depois.jpeg'
}
const VIDEO_DEFAULT = 'assets/videos/espaço.mp4'
const CARROSSEL_DEFAULTS = [
  'images/carrossel1.jpeg',
  'images/carrossel2.jpeg',
  'images/carrossel3.jpeg'
]
const GRID_DEFAULTS = Array.from({ length: 16 }, (_, i) => `images/galeria${i + 5}.jpeg`)

function normalizeImageEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { filename: path.basename(entry), src: entry }
  }
  if (typeof entry === 'object' && entry.src) {
    return {
      filename: entry.filename || path.basename(entry.src),
      src: entry.src
    }
  }
  return null
}

function normalizeData(rawData = {}) {
  const data = { ...rawData }
  data.clicks = Number.isFinite(data.clicks) ? data.clicks : 0

  if (!Array.isArray(data.carrossel)) {
    data.carrossel = CARROSSEL_DEFAULTS.map(src => ({ filename: path.basename(src), src }))
  } else {
    data.carrossel = data.carrossel.map(normalizeImageEntry).filter(Boolean)
  }

  if (!Array.isArray(data.grid)) {
    data.grid = GRID_DEFAULTS.map(src => ({ filename: path.basename(src), src }))
  } else {
    data.grid = data.grid
      .map(item => (item === null ? null : normalizeImageEntry(item)))
      .slice(0, 16)
    while (data.grid.length < 16) data.grid.push(null)
  }

  if (!data.siteImages || typeof data.siteImages !== 'object') data.siteImages = {}
  for (const [name, defaultSrc] of Object.entries(SITE_IMAGE_DEFAULTS)) {
    if (!data.siteImages[name]) {
      data.siteImages[name] = { filename: path.basename(defaultSrc), src: defaultSrc }
    } else {
      const normalized = normalizeImageEntry(data.siteImages[name])
      data.siteImages[name] = normalized || { filename: path.basename(defaultSrc), src: defaultSrc }
    }
  }

  if (!data.video || typeof data.video !== 'object' || !data.video.src) {
    data.video = { src: VIDEO_DEFAULT }
  }

  if (!Array.isArray(data.estoque)) data.estoque = []

  return data
}

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const normalized = normalizeData(data)
    if (JSON.stringify(normalized) !== JSON.stringify(data)) saveData(normalized)
    return normalized
  } catch {
    const defaultData = normalizeData({
      clicks: 0,
      carrossel: CARROSSEL_DEFAULTS,
      grid: GRID_DEFAULTS,
      siteImages: {
        capa: SITE_IMAGE_DEFAULTS.capa,
        sobrenos: SITE_IMAGE_DEFAULTS.sobrenos,
        antes: SITE_IMAGE_DEFAULTS.antes,
        depois: SITE_IMAGE_DEFAULTS.depois
      },
      video: { src: VIDEO_DEFAULT },
      estoque: []
    })
    saveData(defaultData)
    return defaultData
  }
}

function saveData(data) {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

// --- Admin password (change this!) ---
const ADMIN_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update(ADMIN_PASSWORD)
  .digest('hex')

// --- Multer config for image uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeName = `upload-${Date.now()}${ext}`
    cb(null, safeName)
  }
})

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp']
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Apenas imagens JPG, PNG ou WebP são permitidas.'))
    }
  }
})

// --- Middleware ---
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

if (HAS_CROSS_ORIGIN) {
  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin
    if (requestOrigin && FRONTEND_ORIGINS.includes(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin)
      res.header('Access-Control-Allow-Credentials', 'true')
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
      res.header('Vary', 'Origin')
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }

    next()
  })
}

if (NODE_ENV === 'production' || HAS_CROSS_ORIGIN) {
  app.set('trust proxy', 1)
}

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 2 * 60 * 60 * 1000,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      secure: IS_PRODUCTION ? 'auto' : false
    } // 2 hours
  })
)

// Serve static files
app.use('/images', express.static(UPLOADS_DIR))
if (path.resolve(UPLOADS_DIR) !== path.resolve(BUNDLED_IMAGES_DIR)) {
  app.use('/images', express.static(BUNDLED_IMAGES_DIR))
}
app.use(express.static(__dirname))

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next()
  res.status(401).json({ error: 'Não autorizado' })
}

// --- Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' })

  const hash = crypto.createHash('sha256').update(password).digest('hex')
  if (hash === ADMIN_PASSWORD_HASH) {
    req.session.authenticated = true
    res.json({ success: true })
  } else {
    res.status(401).json({ error: 'Senha incorreta' })
  }
})

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

// Check auth
app.get('/api/auth', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) })
})

// --- Click tracking ---
app.post('/api/click', (req, res) => {
  const data = loadData()
  data.clicks = (data.clicks || 0) + 1
  saveData(data)
  res.json({ clicks: data.clicks })
})

app.get('/api/clicks', requireAuth, (req, res) => {
  const data = loadData()
  res.json({ clicks: data.clicks || 0 })
})

app.post('/api/clicks/reset', requireAuth, (req, res) => {
  const data = loadData()
  data.clicks = 0
  saveData(data)
  res.json({ clicks: 0 })
})

// --- Image management ---

// Get current images
app.get('/api/images', (req, res) => {
  const data = loadData()
  res.json({
    carrossel: data.carrossel || [],
    grid: data.grid || [],
    siteImages: data.siteImages || {},
    video: data.video || { src: VIDEO_DEFAULT }
  })
})

// Upload carousel image
app.post('/api/images/carrossel', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
  const data = loadData()
  if (!data.carrossel) data.carrossel = []
  data.carrossel.push({ filename: req.file.filename, src: `images/${req.file.filename}` })
  saveData(data)
  res.json({ success: true, images: data.carrossel })
})

// Upload grid image at position
app.post('/api/images/grid', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
  const data = loadData()
  if (!data.grid) data.grid = []
  const pos = parseInt(req.body.position)
  if (isNaN(pos) || pos < 0 || pos > 15) {
    return res.status(400).json({ error: 'Posição inválida (0-15)' })
  }
  // Ensure array has enough slots
  while (data.grid.length < 16) data.grid.push(null)
  // Remove old file if it was an upload
  const old = data.grid[pos]
  if (old && old.filename && old.filename.startsWith('upload-')) {
    const oldPath = path.join(UPLOADS_DIR, old.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  data.grid[pos] = { filename: req.file.filename, src: `images/${req.file.filename}` }
  saveData(data)
  res.json({ success: true, images: data.grid })
})

// Delete carousel image
app.delete('/api/images/carrossel/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= (data.carrossel || []).length) {
    return res.status(400).json({ error: 'Índice inválido' })
  }
  const removed = data.carrossel.splice(index, 1)[0]
  // Delete file
  const filePath = path.join(UPLOADS_DIR, removed.filename)
  if (removed.filename.startsWith('upload-') && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  saveData(data)
  res.json({ success: true, images: data.carrossel })
})

// Upload site image (capa, sobrenos, antes, depois)
const ALLOWED_SITE_NAMES = Object.keys(SITE_IMAGE_DEFAULTS)

app.post('/api/images/site/:name', requireAuth, upload.single('image'), (req, res) => {
  const name = req.params.name
  if (!ALLOWED_SITE_NAMES.includes(name)) return res.status(400).json({ error: 'Nome inválido' })
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
  const data = loadData()
  if (!data.siteImages) data.siteImages = {}
  const old = data.siteImages[name]
  if (old && old.filename && old.filename.startsWith('upload-')) {
    const oldPath = path.join(UPLOADS_DIR, old.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  data.siteImages[name] = { filename: req.file.filename, src: `images/${req.file.filename}` }
  saveData(data)
  res.json({ success: true, siteImages: data.siteImages })
})

// Reset site image to default
app.delete('/api/images/site/:name', requireAuth, (req, res) => {
  const name = req.params.name
  if (!ALLOWED_SITE_NAMES.includes(name)) return res.status(400).json({ error: 'Nome inválido' })
  const data = loadData()
  if (!data.siteImages) data.siteImages = {}
  const old = data.siteImages[name]
  if (old && old.filename && old.filename.startsWith('upload-')) {
    const oldPath = path.join(UPLOADS_DIR, old.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  data.siteImages[name] = { src: SITE_IMAGE_DEFAULTS[name] }
  saveData(data)
  res.json({ success: true, siteImages: data.siteImages })
})

// Delete grid image at position
app.delete('/api/images/grid/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= 16 || !data.grid || !data.grid[index]) {
    return res.status(400).json({ error: 'Posição inválida ou vazia' })
  }
  const removed = data.grid[index]
  const filePath = path.join(UPLOADS_DIR, removed.filename)
  if (removed.filename.startsWith('upload-') && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  data.grid[index] = null
  saveData(data)
  res.json({ success: true, images: data.grid })
})

// --- Video management ---
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `video-${Date.now()}${ext}`)
  }
})

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowedVideoExts = ['.mp4', '.webm', '.mov']
    const allowedVideoMimes = ['video/mp4', 'video/webm', 'video/quicktime']
    if (allowedVideoExts.includes(ext) && allowedVideoMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Apenas vídeos MP4, WebM ou MOV são permitidos.'))
    }
  }
})

app.post('/api/video', requireAuth, videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado' })
  const data = loadData()
  const old = data.video
  if (old && old.filename && old.filename.startsWith('video-')) {
    const oldPath = path.join(UPLOADS_DIR, old.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  data.video = { filename: req.file.filename, src: `images/${req.file.filename}` }
  saveData(data)
  res.json({ success: true, video: data.video })
})

app.delete('/api/video', requireAuth, (req, res) => {
  const data = loadData()
  const old = data.video
  if (old && old.filename && old.filename.startsWith('video-')) {
    const oldPath = path.join(UPLOADS_DIR, old.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }
  data.video = { src: VIDEO_DEFAULT }
  saveData(data)
  res.json({ success: true, video: data.video })
})

// --- Inventory management ---
app.get('/api/estoque', requireAuth, (req, res) => {
  const data = loadData()
  res.json({ estoque: data.estoque || [] })
})

app.post('/api/estoque', requireAuth, (req, res) => {
  const { nome, quantidade, preco, observacao } = req.body
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' })
  const data = loadData()
  if (!data.estoque) data.estoque = []
  data.estoque.push({
    id: Date.now(),
    nome: String(nome).substring(0, 200),
    quantidade: parseInt(quantidade) || 0,
    preco: parseFloat(preco) || 0,
    observacao: String(observacao || '').substring(0, 500)
  })
  saveData(data)
  res.json({ success: true, estoque: data.estoque })
})

app.put('/api/estoque/:id', requireAuth, (req, res) => {
  const data = loadData()
  const id = parseInt(req.params.id)
  const item = (data.estoque || []).find(i => i.id === id)
  if (!item) return res.status(404).json({ error: 'Item não encontrado' })

  const { nome, quantidade, preco, observacao } = req.body
  if (nome !== undefined) item.nome = String(nome).substring(0, 200)
  if (quantidade !== undefined) item.quantidade = parseInt(quantidade) || 0
  if (preco !== undefined) item.preco = parseFloat(preco) || 0
  if (observacao !== undefined) item.observacao = String(observacao || '').substring(0, 500)
  saveData(data)
  res.json({ success: true, estoque: data.estoque })
})

app.delete('/api/estoque/:id', requireAuth, (req, res) => {
  const data = loadData()
  const id = parseInt(req.params.id)
  data.estoque = (data.estoque || []).filter(i => i.id !== id)
  saveData(data)
  res.json({ success: true, estoque: data.estoque })
})

// --- Admin page ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'))
})

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
  console.log(`Painel admin em http://localhost:${PORT}/admin`)
  console.log(`Data file: ${DATA_FILE}`)
  console.log(`Uploads dir: ${UPLOADS_DIR}`)
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Senha padrão: vivis2026')
  }
  if (HAS_CROSS_ORIGIN) {
    console.log(`CORS habilitado para: ${FRONTEND_ORIGINS.join(', ')}`)
  }
  if (!PERSISTENT_ROOT) {
    console.log('Armazenamento persistente não configurado; uploads e dados usarão o disco local da aplicação.')
  }
})
