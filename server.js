const express = require('express')
const session = require('express-session')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const HAS_CROSS_ORIGIN = FRONTEND_ORIGINS.length > 0
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vivis2026'

// --- Data file ---
const DATA_FILE = path.join(__dirname, 'data', 'data.json')

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    const defaultData = {
      clicks: 0,
      carrossel: [],
      grid: [],
      estoque: []
    }
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
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'images')),
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
      sameSite: HAS_CROSS_ORIGIN ? 'none' : 'lax',
      secure: HAS_CROSS_ORIGIN ? 'auto' : false
    } // 2 hours
  })
)

// Serve static files
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
  res.json({ carrossel: data.carrossel || [], grid: data.grid || [] })
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
    const oldPath = path.join(__dirname, 'images', old.filename)
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
  const filePath = path.join(__dirname, 'images', removed.filename)
  if (removed.filename.startsWith('upload-') && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  saveData(data)
  res.json({ success: true, images: data.carrossel })
})

// Delete grid image at position
app.delete('/api/images/grid/:index', requireAuth, (req, res) => {
  const data = loadData()
  const index = parseInt(req.params.index)
  if (isNaN(index) || index < 0 || index >= 16 || !data.grid || !data.grid[index]) {
    return res.status(400).json({ error: 'Posição inválida ou vazia' })
  }
  const removed = data.grid[index]
  const filePath = path.join(__dirname, 'images', removed.filename)
  if (removed.filename.startsWith('upload-') && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  data.grid[index] = null
  saveData(data)
  res.json({ success: true, images: data.grid })
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
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Senha padrão: vivis2026')
  }
  if (HAS_CROSS_ORIGIN) {
    console.log(`CORS habilitado para: ${FRONTEND_ORIGINS.join(', ')}`)
  }
})
