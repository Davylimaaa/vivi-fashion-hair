document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = window.location.origin

  function apiUrl(path) {
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path
  }

  function assetUrl(src) {
    if (!src) return ''
    if (/^https?:\/\//i.test(src)) return src
    const cleanSrc = String(src).replace(/^\/+/, '')
    return API_BASE_URL ? `${API_BASE_URL}/${cleanSrc}` : `/${cleanSrc}`
  }

  const loginScreen = document.getElementById('login-screen')
  const adminPanel = document.getElementById('admin-panel')
  const loginForm = document.getElementById('login-form')
  const loginError = document.getElementById('login-error')
  const btnLogout = document.getElementById('btn-logout')

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
    loadImages()
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
    const data = await res.json()
    document.getElementById('click-count').textContent = data.clicks
  }

  document.getElementById('btn-reset-clicks').addEventListener('click', async () => {
    if (!confirm('Resetar o contador de cliques?')) return
    await fetch(apiUrl('/api/clicks/reset'), { method: 'POST', credentials: 'include' })
    document.getElementById('click-count').textContent = '0'
  })

  // --- Images ---
  async function loadImages() {
    const res = await fetch(apiUrl('/api/images'), { credentials: 'include' })
    const data = await res.json()
    renderCarrosselImages(data.carrossel)
    renderGridPositions(data.grid)
  }

  function renderCarrosselImages(images) {
    const container = document.getElementById('carrossel-images')
    if (!images || images.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma foto adicionada</p>'
      return
    }
    container.innerHTML = images.map((img, i) => `
      <div class="image-item">
        <img src="${assetUrl(img.src)}" alt="Foto ${i + 1}">
        <button class="delete-btn" onclick="deleteImage('carrossel', ${i})" title="Remover">&times;</button>
      </div>
    `).join('')
  }

  function renderGridPositions(grid) {
    const container = document.getElementById('grid-positions')
    let html = ''
    for (let i = 0; i < 16; i++) {
      const img = grid && grid[i] ? grid[i] : null
      if (img) {
        html += `
          <div class="grid-pos filled" data-pos="${i}">
            <img src="${assetUrl(img.src)}" alt="Posição ${i + 1}">
            <span class="pos-label">${i + 1}</span>
            <div class="pos-actions">
              <button class="pos-btn-replace" onclick="replaceGridImage(${i})" title="Trocar foto">&#8635;</button>
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
  }

  // Carrossel upload
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
      loadImages()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao enviar imagem')
    }

    e.target.value = ''
  }

  // Grid position upload
  let pendingGridPos = null
  const gridInput = document.getElementById('input-grid')

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
      loadImages()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao enviar imagem')
    }

    pendingGridPos = null
    e.target.value = ''
  })

  window.deleteGridImage = async (pos) => {
    if (!confirm(`Remover foto da posição ${pos + 1}?`)) return
    const res = await fetch(apiUrl(`/api/images/grid/${pos}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) loadImages()
  }

  // Delete carrossel image
  window.deleteImage = async (type, index) => {
    if (!confirm('Remover esta foto?')) return
    const res = await fetch(apiUrl(`/api/images/${type}/${index}`), {
      method: 'DELETE',
      credentials: 'include'
    })
    if (res.ok) loadImages()
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
            <th>Preço</th>
            <th>Observação</th>
            <th>Ações</th>
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
    const preco = prompt('Preço:')
    if (preco === null) return
    const observacao = prompt('Observação:')

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
