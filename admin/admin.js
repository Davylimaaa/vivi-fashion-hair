document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = window.location.origin
  const DEFAULT_IMAGE_STYLE = { fit: 'cover', zoom: 100, posX: 50, posY: 50 }

  function apiUrl(path) {
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path
  }

  function assetUrl(src) {
    if (!src) return ''
    if (/^https?:\/\//i.test(src)) return src
    const cleanSrc = String(src).replace(/^\/+/, '')
    return API_BASE_URL ? `${API_BASE_URL}/${cleanSrc}` : `/${cleanSrc}`
  }

  function normalizeStyle(style) {
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

  function applyImageStyle(img, style) {
    if (!img) return
    const normalized = normalizeStyle(style)
    img.style.objectFit = normalized.fit
    img.style.objectPosition = `${normalized.posX}% ${normalized.posY}%`
    img.style.transform = `scale(${normalized.zoom / 100})`
    img.style.transformOrigin = `${normalized.posX}% ${normalized.posY}%`
  }

  async function parseError(res, fallbackMessage) {
    const err = await res.json().catch(() => ({}))
    return err.error || fallbackMessage
  }

  const loginScreen = document.getElementById('login-screen')
  const adminPanel = document.getElementById('admin-panel')
  const loginForm = document.getElementById('login-form')
  const loginError = document.getElementById('login-error')
  const btnLogout = document.getElementById('btn-logout')

  const modal = document.getElementById('image-style-modal')
  const modalClose = document.getElementById('style-modal-close')
  const modalTitle = document.getElementById('style-modal-title')
  const modalPreview = document.getElementById('style-modal-preview')
  const fitInput = document.getElementById('style-fit')
  const zoomInput = document.getElementById('style-zoom')
  const posXInput = document.getElementById('style-posx')
  const posYInput = document.getElementById('style-posy')
  const zoomValue = document.getElementById('style-zoom-value')
  const posXValue = document.getElementById('style-posx-value')
  const posYValue = document.getElementById('style-posy-value')
  const styleSaveBtn = document.getElementById('style-save')
  const styleResetBtn = document.getElementById('style-reset')

  let styleTarget = null
  let pendingGridPos = null
  let pendingKidsPos = null

  function handleUnauthorized() {
    adminPanel.classList.add('hidden')
    loginScreen.classList.remove('hidden')
    loginError.textContent = 'Sessao expirada. Faca login novamente.'
    loginError.classList.remove('hidden')
  }

  function getCurrentModalStyle() {
    return normalizeStyle({
      fit: fitInput.value,
      zoom: Number(zoomInput.value),
      posX: Number(posXInput.value),
      posY: Number(posYInput.value)
    })
  }

  function updateModalPreview() {
    const style = getCurrentModalStyle()
    zoomValue.textContent = `${style.zoom}%`
    posXValue.textContent = `${style.posX}%`
    posYValue.textContent = `${style.posY}%`
    applyImageStyle(modalPreview, style)
  }

  function openStyleEditor(target) {
    styleTarget = target
    const style = normalizeStyle(target.style)
    modalTitle.textContent = `Ajustar imagem: ${target.title}`
    modalPreview.src = assetUrl(target.src)
    fitInput.value = style.fit
    zoomInput.value = String(style.zoom)
    posXInput.value = String(style.posX)
    posYInput.value = String(style.posY)
    updateModalPreview()
    modal.classList.remove('hidden')
  }

  function closeStyleEditor() {
    styleTarget = null
    modal.classList.add('hidden')
    modalPreview.src = ''
  }

  function styleEndpoint(type, id) {
    if (type === 'carrossel') return `/api/images/style/carrossel/${id}`
    if (type === 'grid') return `/api/images/style/grid/${id}`
    if (type === 'site') return `/api/images/style/site/${id}`
    if (type === 'kids') return `/api/images/style/kids/${id}`
    return ''
  }

  fitInput.addEventListener('change', updateModalPreview)
  zoomInput.addEventListener('input', updateModalPreview)
  posXInput.addEventListener('input', updateModalPreview)
  posYInput.addEventListener('input', updateModalPreview)

  modalClose.addEventListener('click', closeStyleEditor)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeStyleEditor()
  })

  styleResetBtn.addEventListener('click', () => {
    fitInput.value = DEFAULT_IMAGE_STYLE.fit
    zoomInput.value = String(DEFAULT_IMAGE_STYLE.zoom)
    posXInput.value = String(DEFAULT_IMAGE_STYLE.posX)
    posYInput.value = String(DEFAULT_IMAGE_STYLE.posY)
    updateModalPreview()
  })

  styleSaveBtn.addEventListener('click', async () => {
    if (!styleTarget) return
    const endpoint = styleEndpoint(styleTarget.type, styleTarget.id)
    if (!endpoint) return

    const res = await fetch(apiUrl(endpoint), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(getCurrentModalStyle())
    })

    if (res.ok) {
      closeStyleEditor()
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao salvar ajuste da imagem')
      alert(err)
    }
  })

  window.openStyleEditor = (type, id, title, src, style) => {
    openStyleEditor({ type, id, title, src, style })
  }

  function createAdjustButton(type, id, title, src, style) {
    const encodedTitle = JSON.stringify(title)
    const encodedSrc = JSON.stringify(src)
    const encodedStyle = JSON.stringify(style || DEFAULT_IMAGE_STYLE)
    return `<button class="adjust-btn" onclick='openStyleEditor(${JSON.stringify(type)}, ${JSON.stringify(id)}, ${encodedTitle}, ${encodedSrc}, ${encodedStyle})' title="Ajustar imagem">Ajustar</button>`
  }

  // --- Check auth on load ---
  fetch(apiUrl('/api/auth'), { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (data.authenticated) showAdmin()
    })

  // --- Login ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    loginError.classList.add('hidden')
    const password = document.getElementById('login-password').value

    const res = await fetch(apiUrl('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password })
    })

    if (res.ok) {
      showAdmin()
    } else {
      const err = await res.json().catch(() => ({}))
      loginError.textContent = err.error || 'Senha incorreta'
      loginError.classList.remove('hidden')
    }
  })

  // --- Logout ---
  btnLogout.addEventListener('click', async () => {
    await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' })
    adminPanel.classList.add('hidden')
    loginScreen.classList.remove('hidden')
    document.getElementById('login-password').value = ''
  })

  function showAdmin() {
    loginScreen.classList.add('hidden')
    adminPanel.classList.remove('hidden')
    loadDashboard()
    loadAllMedia()
    loadEstoque()
  }

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active')
    })
  })

  // --- Dashboard ---
  async function loadDashboard() {
    const res = await fetch(apiUrl('/api/clicks'), { credentials: 'include' })
    if (res.status === 401) return handleUnauthorized()
    if (!res.ok) return
    const data = await res.json()
    document.getElementById('click-count').textContent = data.clicks
  }

  document.getElementById('btn-reset-clicks').addEventListener('click', async () => {
    if (!confirm('Resetar o contador de cliques?')) return
    await fetch(apiUrl('/api/clicks/reset'), { method: 'POST', credentials: 'include' })
    document.getElementById('click-count').textContent = '0'
  })

  async function fetchImagesData() {
    const res = await fetch(apiUrl('/api/images'), { credentials: 'include' })
    if (res.status === 401) {
      handleUnauthorized()
      return null
    }
    if (!res.ok) return null
    return await res.json()
  }

  async function loadAllMedia() {
    const data = await fetchImagesData()
    if (!data) return
    renderCarrosselImages(data.carrossel || [])
    renderGridPositions(data.grid || [])
    renderSiteImages(data.siteImages || {})
    renderVideo(data.video)
    renderKids(data.kids || { photos: [null, null, null, null], boomerang: null })
  }

  // --- Carrossel ---
  function renderCarrosselImages(images) {
    const container = document.getElementById('carrossel-images')
    if (!images || images.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma foto adicionada</p>'
      return
    }
    container.innerHTML = images.map((img, i) => `
      <div class="image-item">
        <img src="${assetUrl(img.src)}" alt="Foto ${i + 1}" class="preview-img" data-style='${JSON.stringify(img.style || DEFAULT_IMAGE_STYLE)}'>
        <div class="image-actions">
          ${createAdjustButton('carrossel', i, `Carrossel ${i + 1}`, img.src, img.style)}
          <button class="delete-btn-inline" onclick="deleteImage('carrossel', ${i})" title="Remover">Remover</button>
        </div>
        <button class="delete-btn" onclick="deleteImage('carrossel', ${i})" title="Remover">&times;</button>
      </div>
    `).join('')

    container.querySelectorAll('.preview-img').forEach(img => {
      const style = JSON.parse(img.dataset.style || '{}')
      applyImageStyle(img, style)
    })
  }

  document.getElementById('input-carrossel').addEventListener('change', (e) => uploadImage(e, 'carrossel'))

  async function uploadImage(e, type) {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('image', file)

    const res = await fetch(apiUrl(`/api/images/${type}`), {
      method: 'POST',
      credentials: 'include',
      body: formData
    })

    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao enviar imagem')
      alert(err)
    }

    e.target.value = ''
  }

  window.deleteImage = async (type, index) => {
    if (!confirm('Remover esta foto?')) return
    const res = await fetch(apiUrl(`/api/images/${type}/${index}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao remover imagem')
      alert(err)
    }
  }

  // --- Grid ---
  const gridInput = document.getElementById('input-grid')

  function renderGridPositions(grid) {
    const container = document.getElementById('grid-positions')
    let html = ''
    for (let i = 0; i < 16; i++) {
      const img = grid && grid[i] ? grid[i] : null
      if (img) {
        html += `
          <div class="grid-pos filled" data-pos="${i}">
            <img src="${assetUrl(img.src)}" alt="Posicao ${i + 1}" class="preview-img" data-style='${JSON.stringify(img.style || DEFAULT_IMAGE_STYLE)}'>
            <span class="pos-label">${i + 1}</span>
            <div class="pos-actions">
              <button class="pos-btn-replace" onclick="replaceGridImage(${i})" title="Trocar foto">&#8635;</button>
              <button class="pos-btn-adjust" onclick='openStyleEditor("grid", ${i}, "Grid ${i + 1}", ${JSON.stringify(img.src)}, ${JSON.stringify(img.style || DEFAULT_IMAGE_STYLE)})' title="Ajustar imagem">&#9881;</button>
              <button class="pos-btn-delete" onclick="deleteGridImage(${i})" title="Remover">&times;</button>
            </div>
          </div>`
      } else {
        html += `
          <div class="grid-pos empty" data-pos="${i}" onclick="addGridImage(${i})">
            <span class="pos-label">${i + 1}</span>
            <span class="pos-plus">+</span>
          </div>`
      }
    }
    container.innerHTML = html

    container.querySelectorAll('.preview-img').forEach(img => {
      const style = JSON.parse(img.dataset.style || '{}')
      applyImageStyle(img, style)
    })
  }

  window.addGridImage = (pos) => {
    pendingGridPos = pos
    gridInput.click()
  }

  window.replaceGridImage = (pos) => {
    pendingGridPos = pos
    gridInput.click()
  }

  gridInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file || pendingGridPos === null) return

    const formData = new FormData()
    formData.append('image', file)
    formData.append('position', pendingGridPos)

    const res = await fetch(apiUrl('/api/images/grid'), {
      method: 'POST',
      credentials: 'include',
      body: formData
    })

    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao enviar imagem')
      alert(err)
    }

    pendingGridPos = null
    e.target.value = ''
  })

  window.deleteGridImage = async (pos) => {
    if (!confirm(`Remover foto da posicao ${pos + 1}?`)) return
    const res = await fetch(apiUrl(`/api/images/grid/${pos}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao remover imagem')
      alert(err)
    }
  }

  // --- Site Images ---
  const SITE_IMAGE_LABELS = {
    capa: 'Foto Capa (Inicio)',
    sobrenos: 'Foto Sobre Nos',
    antes: 'Foto Antes (Depoimentos)',
    depois: 'Foto Depois (Depoimentos)'
  }

  function renderSiteImages(siteImages) {
    const container = document.getElementById('site-images-grid')
    const names = ['capa', 'sobrenos', 'antes', 'depois']
    container.innerHTML = names.map(name => {
      const img = siteImages[name]
      const src = img ? img.src : ''
      const style = img && img.style ? img.style : DEFAULT_IMAGE_STYLE
      return `
        <div class="site-img-item">
          <div class="site-img-label">${SITE_IMAGE_LABELS[name]}</div>
          <div class="site-img-preview">
            ${src ? `<img src="${assetUrl(src)}" alt="${SITE_IMAGE_LABELS[name]}" class="preview-img" data-style='${JSON.stringify(style)}'>` : '<span class="empty-state">Sem imagem</span>'}
          </div>
          <div class="site-img-actions">
            <label class="upload-btn" style="font-size:0.8rem;padding:0.5rem 1rem">
              <span>↻ Trocar</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-name="${name}" class="input-site-image">
            </label>
            ${src ? createAdjustButton('site', name, SITE_IMAGE_LABELS[name], src, style) : ''}
            <button class="btn-secondary" style="font-size:0.8rem" onclick="resetSiteImage('${name}')">Restaurar original</button>
          </div>
        </div>`
    }).join('')

    container.querySelectorAll('.preview-img').forEach(img => {
      const style = JSON.parse(img.dataset.style || '{}')
      applyImageStyle(img, style)
    })

    container.querySelectorAll('.input-site-image').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0]
        if (!file) return
        const name = e.target.dataset.name
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch(apiUrl(`/api/images/site/${name}`), {
          method: 'POST',
          credentials: 'include',
          body: formData
        })
        if (res.ok) {
          loadAllMedia()
        } else if (res.status === 401) {
          handleUnauthorized()
        } else {
          const err = await parseError(res, 'Erro ao enviar imagem')
          alert(err)
        }
        e.target.value = ''
      })
    })
  }

  window.resetSiteImage = async (name) => {
    if (!confirm('Restaurar a foto original?')) return
    const res = await fetch(apiUrl(`/api/images/site/${name}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao restaurar imagem')
      alert(err)
    }
  }

  // --- Video ---
  function renderVideo(video) {
    const container = document.getElementById('video-preview')
    const src = video && video.src ? assetUrl(video.src) : ''
    container.innerHTML = src
      ? `<video src="${src}" controls muted style="width:100%;max-width:600px;border-radius:0.5rem;"></video>`
      : '<p class="empty-state">Nenhum video carregado</p>'
  }

  document.getElementById('input-video').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('video', file)
    const res = await fetch(apiUrl('/api/video'), {
      method: 'POST',
      credentials: 'include',
      body: formData
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao enviar video')
      alert(err)
    }
    e.target.value = ''
  })

  // --- Kids ---
  const kidsPhotoInput = document.getElementById('input-kids-photo')

  function renderKids(kids) {
    const photos = Array.isArray(kids.photos) ? kids.photos : [null, null, null, null]
    const kidsContainer = document.getElementById('kids-positions')
    let html = ''

    for (let i = 0; i < 4; i++) {
      const item = photos[i]
      if (item && item.src) {
        html += `
          <div class="grid-pos filled" data-pos="${i}">
            <img src="${assetUrl(item.src)}" alt="Kids ${i + 1}" class="preview-img" data-style='${JSON.stringify(item.style || DEFAULT_IMAGE_STYLE)}'>
            <span class="pos-label">${i + 1}</span>
            <div class="pos-actions">
              <button class="pos-btn-replace" onclick="replaceKidsPhoto(${i})" title="Trocar foto">&#8635;</button>
              <button class="pos-btn-adjust" onclick='openStyleEditor("kids", ${i}, "Kids ${i + 1}", ${JSON.stringify(item.src)}, ${JSON.stringify(item.style || DEFAULT_IMAGE_STYLE)})' title="Ajustar imagem">&#9881;</button>
              <button class="pos-btn-delete" onclick="deleteKidsPhoto(${i})" title="Remover">&times;</button>
            </div>
          </div>`
      } else {
        html += `
          <div class="grid-pos empty" data-pos="${i}" onclick="addKidsPhoto(${i})">
            <span class="pos-label">${i + 1}</span>
            <span class="pos-plus">+</span>
          </div>`
      }
    }

    kidsContainer.innerHTML = html

    kidsContainer.querySelectorAll('.preview-img').forEach(img => {
      const style = JSON.parse(img.dataset.style || '{}')
      applyImageStyle(img, style)
    })

    const boomerangWrap = document.getElementById('kids-boomerang')
    const boomerang = kids && kids.boomerang && kids.boomerang.src ? kids.boomerang : null
    boomerangWrap.innerHTML = boomerang
      ? `
        <div class="boomerang-admin-wrap">
          <video src="${assetUrl(boomerang.src)}" controls loop muted style="width:100%;max-width:600px;border-radius:0.5rem;"></video>
          <button class="btn-danger" style="margin-top:0.75rem" onclick="deleteKidsBoomerang()">Remover boomerang</button>
        </div>
      `
      : '<p class="empty-state">Nenhum boomerang carregado</p>'
  }

  window.addKidsPhoto = (pos) => {
    pendingKidsPos = pos
    kidsPhotoInput.click()
  }

  window.replaceKidsPhoto = (pos) => {
    pendingKidsPos = pos
    kidsPhotoInput.click()
  }

  kidsPhotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file || pendingKidsPos === null) return

    const formData = new FormData()
    formData.append('image', file)
    formData.append('position', pendingKidsPos)

    const res = await fetch(apiUrl('/api/images/kids/photo'), {
      method: 'POST',
      credentials: 'include',
      body: formData
    })

    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao enviar foto kids')
      alert(err)
    }

    pendingKidsPos = null
    e.target.value = ''
  })

  window.deleteKidsPhoto = async (pos) => {
    if (!confirm(`Remover foto kids da posicao ${pos + 1}?`)) return
    const res = await fetch(apiUrl(`/api/images/kids/photo/${pos}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao remover foto kids')
      alert(err)
    }
  }

  document.getElementById('input-kids-boomerang').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('video', file)

    const res = await fetch(apiUrl('/api/images/kids/boomerang'), {
      method: 'POST',
      credentials: 'include',
      body: formData
    })

    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao enviar boomerang kids')
      alert(err)
    }

    e.target.value = ''
  })

  window.deleteKidsBoomerang = async () => {
    if (!confirm('Remover boomerang kids?')) return
    const res = await fetch(apiUrl('/api/images/kids/boomerang'), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) {
      loadAllMedia()
    } else if (res.status === 401) {
      handleUnauthorized()
    } else {
      const err = await parseError(res, 'Erro ao remover boomerang kids')
      alert(err)
    }
  }

  // --- Estoque ---
  const formEstoque = document.getElementById('form-estoque')

  async function loadEstoque() {
    const res = await fetch(apiUrl('/api/estoque'), { credentials: 'include' })
    const data = await res.json()
    renderEstoque(data.estoque)
  }

  function renderEstoque(estoque) {
    const container = document.getElementById('estoque-list')
    if (!estoque || estoque.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhum produto no estoque</p>'
      return
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Preco</th>
            <th>Observacao</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          ${estoque.map(item => `
            <tr>
              <td>${escapeHtml(item.nome)}</td>
              <td>${item.quantidade}</td>
              <td>R$ ${item.preco.toFixed(2)}</td>
              <td>${escapeHtml(item.observacao || '-')}</td>
              <td class="actions">
                <button class="btn-edit" onclick="editEstoque(${item.id})">Editar</button>
                <button class="btn-delete" onclick="deleteEstoque(${item.id})">Excluir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  formEstoque.addEventListener('submit', async (e) => {
    e.preventDefault()
    const body = {
      nome: document.getElementById('est-nome').value,
      quantidade: document.getElementById('est-qtd').value,
      preco: document.getElementById('est-preco').value,
      observacao: document.getElementById('est-obs').value
    }

    const res = await fetch(apiUrl('/api/estoque'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    })

    if (res.ok) {
      formEstoque.reset()
      loadEstoque()
    }
  })

  window.deleteEstoque = async (id) => {
    if (!confirm('Excluir este produto?')) return
    const res = await fetch(apiUrl(`/api/estoque/${id}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) loadEstoque()
  }

  window.editEstoque = async (id) => {
    const nome = prompt('Nome do produto:')
    if (nome === null) return
    const quantidade = prompt('Quantidade:')
    if (quantidade === null) return
    const preco = prompt('Preco:')
    if (preco === null) return
    const observacao = prompt('Observacao:')

    const res = await fetch(apiUrl(`/api/estoque/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nome, quantidade, preco, observacao })
    })

    if (res.ok) loadEstoque()
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }
})
