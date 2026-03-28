const express = require('express')
const session = require('express-session')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const https = require('https')
const crypto = require('crypto')
const cloudinary = require('cloudinary').v2

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

// --- Cloudinary config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
})
const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)
const CLOUDINARY_DATA_PUBLIC_ID = 'vivis-salon-data/data'

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

function isRemoteSrc(src) {
  return /^https?:\/\//i.test(String(src || ''))
}

function localAssetExists(src) {
  if (!src || isRemoteSrc(src)) return true
  const cleanSrc = String(src).replace(/^\/+/, '').replace(/\//g, path.sep)
  return fs.existsSync(path.join(__dirname, cleanSrc))
}

function sanitizeMediaEntry(entry, fallback = null) {
  const normalized = normalizeImageEntry(entry)
  if (!normalized) return fallback
  if (normalized.public_id || localAssetExists(normalized.src)) return normalized
  return fallback
}

function normalizeImageStyle(style) {
  const src = style && typeof style === 'object' ? style : {}
  const fit = src.fit === 'contain' ? 'contain' : 'cover'
  const zoom = Number.isFinite(Number(src.zoom)) ? Number(src.zoom) : 100
  const posX = Number.isFinite(Number(src.posX)) ? Number(src.posX) : 50
  const posY = Number.isFinite(Number(src.posY)) ? Number(src.posY) : 50
  return {
    fit,
    zoom: Math.max(50, Math.min(200, zoom)),
    posX: Math.max(0, Math.min(100, posX)),
    posY: Math.max(0, Math.min(100, posY))
  }
}

function normalizeImageEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return {
      filename: path.basename(entry),
      src: entry,
      style: normalizeImageStyle()
    }
  }
  if (typeof entry === 'object' && entry.src) {
    const result = {
      src: entry.src,
      style: normalizeImageStyle(entry.style)
    }
    if (entry.public_id) {
      result.public_id = entry.public_id
      result.resource_type = entry.resource_type || 'image'
    } else {
      result.filename = entry.filename || path.basename(entry.src)
    }
    return result
  }
  return null
}

function normalizeData(rawData = {}) {
  const data = { ...rawData }
  data.clicks = Number.isFinite(data.clicks) ? data.clicks : 0

  if (!Array.isArray(data.carrossel)) {
    data.carrossel = CARROSSEL_DEFAULTS.map(src => ({ filename: path.basename(src), src }))
  } else {
    data.carrossel = data.carrossel
      .map(item => sanitizeMediaEntry(item, null))
      .filter(Boolean)
  }

  if (!Array.isArray(data.grid)) {
    data.grid = GRID_DEFAULTS.map(src => ({ filename: path.basename(src), src }))
  } else {
    data.grid = data.grid
      .map(item => (item === null ? null : sanitizeMediaEntry(item, null)))
      .slice(0, 16)
    while (data.grid.length < 16) data.grid.push(null)
  }

  if (!data.siteImages || typeof data.siteImages !== 'object') data.siteImages = {}
  for (const [name, defaultSrc] of Object.entries(SITE_IMAGE_DEFAULTS)) {
    if (!data.siteImages[name]) {
      data.siteImages[name] = { filename: path.basename(defaultSrc), src: defaultSrc }
    } else {
      const normalized = sanitizeMediaEntry(data.siteImages[name], null)
      data.siteImages[name] = normalized || { filename: path.basename(defaultSrc), src: defaultSrc }
    }
  }

  if (!data.video || typeof data.video !== 'object' || !data.video.src) {
    data.video = { src: VIDEO_DEFAULT }
  } else {
    data.video = sanitizeMediaEntry(data.video, { src: VIDEO_DEFAULT })
  }

  if (!data.kids || typeof data.kids !== 'object') data.kids = {}
  if (!Array.isArray(data.kids.photos)) {
    data.kids.photos = Array.from({ length: 4 }, () => null)
  } else {
    data.kids.photos = data.kids.photos
      .map(item => (item === null ? null : sanitizeMediaEntry(item, null)))
      .slice(0, 4)
    while (data.kids.photos.length < 4) data.kids.photos.push(null)
  }
  data.kids.boomerang = sanitizeMediaEntry(data.kids.boomerang, null)

  if (!Array.isArray(data.estoque)) data.estoque = []

  return data
}

// --- In-memory data store ---
let _data = null

function loadData() {
  return _data
}

function saveDataLocal(data) {
  try {
    const dir = path.dirname(DATA_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error('Error saving local data:', err.message)
  }
}

// --- Cloudinary helpers ---
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
    stream.end(buffer)
  })
}

function deleteFromCloudinary(publicId, resourceType = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
}

function fetchCloudinaryRaw(publicId) {
  return new Promise((resolve, reject) => {
    const url = cloudinary.url(publicId, { resource_type: 'raw' }) + `?_=${Date.now()}`
    https.get(url, (res) => {
      if (res.statusCode === 404) {
        res.resume()
        reject(new Error('Not found'))
        return
      }
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function saveDataToCloudinary(data) {
  if (!USE_CLOUDINARY) return Promise.resolve()
  const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
  return uploadToCloudinary(buffer, {
    public_id: CLOUDINARY_DATA_PUBLIC_ID,
    resource_type: 'raw',
    overwrite: true
  })
}

function saveData(data) {
  _data = data
  saveDataLocal(data)
  if (USE_CLOUDINARY) {
    saveDataToCloudinary(data).catch(err => console.error('Cloudinary data sync error:', err.message))
  }
}

async function initData() {
  // 1. Try Cloudinary raw backup first when enabled
  if (USE_CLOUDINARY) {
    try {
      const jsonStr = await fetchCloudinaryRaw(CLOUDINARY_DATA_PUBLIC_ID)
      const parsed = JSON.parse(jsonStr)
      _data = normalizeData(parsed)
      if (JSON.stringify(parsed) !== JSON.stringify(_data)) {
        saveData(_data)
        console.log('Cloudinary backup sanitized after startup')
      } else {
        saveDataLocal(_data)
      }
      console.log('Data loaded from Cloudinary backup')
      return
    } catch (err) {
      console.log('No Cloudinary data backup found, trying local file')
    }
  }

  // 2. Try local file (dev or Render with disk)
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    _data = normalizeData(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(_data)) {
      saveData(_data)
      console.log('Data sanitized after startup')
    }
    console.log('Data loaded from local file')
    return
  } catch {}

  // 3. Use defaults
  _data = normalizeData({})
  saveData(_data)
  console.log(USE_CLOUDINARY ? 'Default data saved to Cloudinary' : 'Using default data (local)')
}

async function processUploadedFile(file, resourceType = 'image') {
  if (USE_CLOUDINARY) {
    const result = await uploadToCloudinary(file.buffer, {
      folder: 'vivis-salon',
      resource_type: resourceType
    })
    return {
      public_id: result.public_id,
      resource_type: resourceType,
      src: result.secure_url
    }
  }
  return {
    filename: file.filename,
    src: `images/${file.filename}`
  }
}

async function deleteEntryFile(entry) {
  if (!entry) return
  if (entry.public_id) {
    await deleteFromCloudinary(entry.public_id, entry.resource_type || 'image')
      .catch(err => console.error('Cloudinary delete error:', err.message))
  } else if (entry.filename && (entry.filename.startsWith('upload-') || entry.filename.startsWith('video-'))) {
    const filePath = path.join(UPLOADS_DIR, entry.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
}

// --- Admin password (change this!) ---
const ADMIN_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update(ADMIN_PASSWORD)
  .digest('hex')

// --- Multer config for image uploads ---
const imageStorageEngine = USE_CLOUDINARY
  ? multer.memoryStorage()
  : multer.diskStorage({
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
  storage: imageStorageEngine,
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
    video: data.video || { src: VIDEO_DEFAULT },
    kids: data.kids || { photos: [null, null, null, null], boomerang: null }
  })
})

// Upload carousel image
app.post('/api/images/carrossel', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
    const fileEntry = await processUploadedFile(req.file, 'image')
    const data = loadData()
    if (!data.carrossel) data.carrossel = []
    data.carrossel.push({ ...fileEntry, style: normalizeImageStyle() })
    saveData(data)
    res.json({ success: true, images: data.carrossel })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload' })
  }
})

// Upload grid image at position
app.post('/api/images/grid', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
    const data = loadData()
    if (!data.grid) data.grid = []
    const pos = parseInt(req.body.position)
    if (isNaN(pos) || pos < 0 || pos > 15) {
      return res.status(400).json({ error: 'Posição inválida (0-15)' })
    }
    while (data.grid.length < 16) data.grid.push(null)
    await deleteEntryFile(data.grid[pos])
    const fileEntry = await processUploadedFile(req.file, 'image')
    data.grid[pos] = { ...fileEntry, style: normalizeImageStyle() }
    saveData(data)
    res.json({ success: true, images: data.grid })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload' })
  }
})

// Upload kids photo at position
app.post('/api/images/kids/photo', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
    const data = loadData()
    if (!data.kids || typeof data.kids !== 'object') data.kids = {}
    if (!Array.isArray(data.kids.photos)) data.kids.photos = [null, null, null, null]

    const pos = parseInt(req.body.position)
    if (isNaN(pos) || pos < 0 || pos > 3) {
      return res.status(400).json({ error: 'Posição inválida (0-3)' })
    }

    while (data.kids.photos.length < 4) data.kids.photos.push(null)
    await deleteEntryFile(data.kids.photos[pos])
    const fileEntry = await processUploadedFile(req.file, 'image')
    data.kids.photos[pos] = { ...fileEntry, style: normalizeImageStyle() }
    saveData(data)
    res.json({ success: true, kids: data.kids })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload' })
  }
})

// Delete carousel image
app.delete('/api/images/carrossel/:index', requireAuth, async (req, res) => {
  try {
    const data = loadData()
    const index = parseInt(req.params.index)
    if (isNaN(index) || index < 0 || index >= (data.carrossel || []).length) {
      return res.status(400).json({ error: 'Índice inválido' })
    }
    const removed = data.carrossel.splice(index, 1)[0]
    await deleteEntryFile(removed)
    saveData(data)
    res.json({ success: true, images: data.carrossel })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar' })
  }
})

// Upload site image (capa, sobrenos, antes, depois)
const ALLOWED_SITE_NAMES = Object.keys(SITE_IMAGE_DEFAULTS)

app.post('/api/images/site/:name', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const name = req.params.name
    if (!ALLOWED_SITE_NAMES.includes(name)) return res.status(400).json({ error: 'Nome inválido' })
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' })
    const data = loadData()
    if (!data.siteImages) data.siteImages = {}
    await deleteEntryFile(data.siteImages[name])
    const fileEntry = await processUploadedFile(req.file, 'image')
    data.siteImages[name] = { ...fileEntry, style: normalizeImageStyle() }
    saveData(data)
    res.json({ success: true, siteImages: data.siteImages })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload' })
  }
})

// Reset site image to default
app.delete('/api/images/site/:name', requireAuth, async (req, res) => {
  try {
    const name = req.params.name
    if (!ALLOWED_SITE_NAMES.includes(name)) return res.status(400).json({ error: 'Nome inválido' })
    const data = loadData()
    if (!data.siteImages) data.siteImages = {}
    await deleteEntryFile(data.siteImages[name])
    data.siteImages[name] = { src: SITE_IMAGE_DEFAULTS[name] }
    saveData(data)
    res.json({ success: true, siteImages: data.siteImages })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar' })
  }
})

// Delete grid image at position
app.delete('/api/images/grid/:index', requireAuth, async (req, res) => {
  try {
    const data = loadData()
    const index = parseInt(req.params.index)
    if (isNaN(index) || index < 0 || index >= 16 || !data.grid || !data.grid[index]) {
      return res.status(400).json({ error: 'Posição inválida ou vazia' })
    }
    await deleteEntryFile(data.grid[index])
    data.grid[index] = null
    saveData(data)
    res.json({ success: true, images: data.grid })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar' })
  }
})

// Delete kids photo at position
app.delete('/api/images/kids/photo/:index', requireAuth, async (req, res) => {
  try {
    const data = loadData()
    const index = parseInt(req.params.index)
    if (isNaN(index) || index < 0 || index >= 4 || !data.kids || !data.kids.photos || !data.kids.photos[index]) {
      return res.status(400).json({ error: 'Posição inválida ou vazia' })
    }
    await deleteEntryFile(data.kids.photos[index])
    data.kids.photos[index] = null
    saveData(data)
    res.json({ success: true, kids: data.kids })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar' })
  }
})

app.delete('/api/images/kids/boomerang', requireAuth, async (req, res) => {
  try {
    const data = loadData()
    await deleteEntryFile(data.kids && data.kids.boomerang)
    if (!data.kids || typeof data.kids !== 'object') data.kids = {}
    data.kids.boomerang = null
    saveData(data)
    res.json({ success: true, kids: data.kids })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar' })
  }
})

function updateEntryStyle(entry, stylePatch) {
  if (!entry || typeof entry !== 'object' || !entry.src) return null
  entry.style = normalizeImageStyle(stylePatch)
  return entry.style
}

app.put('/api/images/style/carrossel/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= (data.carrossel || []).length) {
    return res.status(400).json({ error: 'Índice inválido' })
  }
  const style = updateEntryStyle(data.carrossel[index], req.body)
  if (!style) return res.status(400).json({ error: 'Imagem inválida' })
  saveData(data)
  res.json({ success: true, style })
})

app.put('/api/images/style/grid/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= 16 || !data.grid || !data.grid[index]) {
    return res.status(400).json({ error: 'Posição inválida' })
  }
  const style = updateEntryStyle(data.grid[index], req.body)
  if (!style) return res.status(400).json({ error: 'Imagem inválida' })
  saveData(data)
  res.json({ success: true, style })
})

app.put('/api/images/style/site/:name', requireAuth, (req, res) => {
  const name = req.params.name
  if (!ALLOWED_SITE_NAMES.includes(name)) return res.status(400).json({ error: 'Nome inválido' })
  const data = loadData()
  if (!data.siteImages || !data.siteImages[name]) return res.status(400).json({ error: 'Imagem inválida' })
  const style = updateEntryStyle(data.siteImages[name], req.body)
  if (!style) return res.status(400).json({ error: 'Imagem inválida' })
  saveData(data)
  res.json({ success: true, style })
})

app.put('/api/images/style/kids/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= 4 || !data.kids || !data.kids.photos || !data.kids.photos[index]) {
    return res.status(400).json({ error: 'Posição inválida' })
  }
  const style = updateEntryStyle(data.kids.photos[index], req.body)
  if (!style) return res.status(400).json({ error: 'Imagem inválida' })
  saveData(data)
  res.json({ success: true, style })
})

// --- Video management ---
const videoStorageEngine = USE_CLOUDINARY
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOADS_DIR),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, `video-${Date.now()}${ext}`)
      }
    })

const videoUpload = multer({
  storage: videoStorageEngine,
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

// Upload kids boomerang (video)
app.post('/api/images/kids/boomerang', requireAuth, videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado' })
    const data = loadData()
    if (!data.kids || typeof data.kids !== 'object') data.kids = {}
    await deleteEntryFile(data.kids.boomerang)
    data.kids.boomerang = await processUploadedFile(req.file, 'video')
    saveData(data)
    res.json({ success: true, kids: data.kids })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload do boomerang' })
  }
})

app.post('/api/video', requireAuth, videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado' })
    const data = loadData()
    await deleteEntryFile(data.video)
    data.video = await processUploadedFile(req.file, 'video')
    saveData(data)
    res.json({ success: true, video: data.video })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao fazer upload do vídeo' })
  }
})

app.delete('/api/video', requireAuth, async (req, res) => {
  try {
    const data = loadData()
    await deleteEntryFile(data.video)
    data.video = { src: VIDEO_DEFAULT }
    saveData(data)
    res.json({ success: true, video: data.video })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao deletar vídeo' })
  }
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
initData().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`)
    console.log(`Painel admin em http://localhost:${PORT}/admin`)
    console.log(`Data file: ${DATA_FILE}`)
    console.log(`Uploads dir: ${UPLOADS_DIR}`)
    if (USE_CLOUDINARY) {
      console.log(`Cloudinary habilitado (cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`)
    }
    if (!process.env.ADMIN_PASSWORD) {
      console.log('Senha padrão: vivis2026')
    }
    if (HAS_CROSS_ORIGIN) {
      console.log(`CORS habilitado para: ${FRONTEND_ORIGINS.join(', ')}`)
    }
    if (!PERSISTENT_ROOT && !USE_CLOUDINARY) {
      console.log('Armazenamento persistente não configurado; uploads e dados usarão o disco local da aplicação.')
    }
  })
}).catch(err => {
  console.error('Falha ao inicializar dados:', err)
  process.exit(1)
})
