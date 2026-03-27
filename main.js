/*
  Close and Open menu
*/
const nav = document.querySelector('#header nav')
const toggle = document.querySelectorAll('nav .toggle')

for (const element of toggle) {
 element.addEventListener('click', function () {
  nav.classList.toggle('show')
 })
}

/*
  Ocultar menu quando item for clicado
*/
const links = document.querySelectorAll('nav ul li a')

for (const link of links) {
 link.addEventListener('click', function () {
  nav.classList.remove('show')
 })
}

/*
  Ocultar e mostrar sombra do header
*/
const header = document.querySelector('#header')
const navHeight = header.offsetHeight

function changeHeaderWhenScroll() {
 if (window.scrollY >= navHeight) {
  header.classList.add('scroll')
 } else {
  header.classList.remove('scroll')
 }
}

/*
  Testimonials carousel slider Swiper
*/
const swiper = new Swiper('.swiper', {
 slidesPerView: 1,
 pagination: {
  el: '.swiper-pagination'
 },
 mousewheel: true,
 keyboard: true,
 breakpoints: {
  762: {
   slidesPerView: 2,
   setWrapperSize: true
  }
 }
})

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

function imageStyleAttr(style) {
 const s = normalizeImageStyle(style)
 return `object-fit:${s.fit};object-position:${s.posX}% ${s.posY}%;transform:scale(${s.zoom / 100});transform-origin:${s.posX}% ${s.posY}%;`
}

function applyImageEntry(el, entry) {
 if (!el) return
 const style = normalizeImageStyle(entry && entry.style)
 el.style.objectFit = style.fit
 el.style.objectPosition = `${style.posX}% ${style.posY}%`
 el.style.transform = `scale(${style.zoom / 100})`
 el.style.transformOrigin = `${style.posX}% ${style.posY}%`
}

function withViewOverlay(imgSrc, altText) {
 return `
  <div class="img-zoom-wrap">
   <img src="${imgSrc}" alt="${altText}">
   <div class="img-ver-overlay"><span>Ver</span></div>
  </div>`
}

function enhanceGalleryGridWithViewButtons() {
 const grid = document.querySelector('.grid-4x4')
 if (!grid) return

 const bareImages = grid.querySelectorAll(':scope > img')
 bareImages.forEach((img, index) => {
  const wrap = document.createElement('div')
  wrap.className = 'img-zoom-wrap'
  img.replaceWith(wrap)
  wrap.appendChild(img)

  const overlay = document.createElement('div')
  overlay.className = 'img-ver-overlay'
  overlay.innerHTML = '<span>Ver</span>'
  wrap.appendChild(overlay)

  if (!img.alt) img.alt = `Grid ${index + 1}`
 })
}

function setVisible(selector, isVisible) {
 const el = document.querySelector(selector)
 if (!el) return
 el.style.display = isVisible ? '' : 'none'
}

const galleryGrid = document.querySelector('.galeria-grid')
const initialGalleryGridMarkup = galleryGrid ? galleryGrid.innerHTML : ''

function normalizeImageEntry(entry) {
 if (!entry) return null
 if (typeof entry === 'string') return { src: entry, style: null }
 if (typeof entry === 'object' && entry.src) return entry
 return null
}

function renderGalleryGrid(images) {
 const gridItems = Array.isArray(images)
  ? images
   .map(normalizeImageEntry)
   .filter(Boolean)
  : []

 if (!galleryGrid) return

 if (gridItems.length === 0) {
  galleryGrid.innerHTML = ''
  galleryGrid.style.display = 'none'
  return
 }

 galleryGrid.innerHTML = gridItems.map((entry, i) =>
  withViewOverlay(assetUrl(entry.src), `Grid ${i + 1}`)
 ).join('')
 galleryGrid.style.display = 'grid'
 galleryGrid.style.visibility = ''
 galleryGrid.style.opacity = ''
 galleryGrid.style.transform = ''

 galleryGrid.querySelectorAll('.img-zoom-wrap img').forEach((img, i) => {
  applyImageEntry(img, gridItems[i])
 })
}

function restoreStaticGalleryGrid() {
 if (!galleryGrid || !initialGalleryGridMarkup.trim()) return
 galleryGrid.innerHTML = initialGalleryGridMarkup
 galleryGrid.style.display = 'grid'
 galleryGrid.style.visibility = ''
 galleryGrid.style.opacity = ''
 galleryGrid.style.transform = ''
 enhanceGalleryGridWithViewButtons()
}

function renderKidsSection(kids) {
 const section = document.getElementById('kids')
 const grid = document.getElementById('kids-grid')
 const boomerangWrap = document.getElementById('kids-boomerang')
 const boomerangSource = document.querySelector('#kids-boomerang video source')
 const boomerangVideo = document.querySelector('#kids-boomerang video')

 if (!section || !grid || !boomerangWrap || !boomerangSource || !boomerangVideo) return

 const photos = Array.isArray(kids && kids.photos)
  ? kids.photos.map(normalizeImageEntry).filter(Boolean)
  : []
 const boomerang = normalizeImageEntry(kids && kids.boomerang)
 const hasContent = photos.length > 0 || !!boomerang

 setVisible('#kids', hasContent)
 if (!hasContent) {
  grid.innerHTML = ''
  boomerangWrap.style.display = 'none'
  return
 }

 grid.innerHTML = photos.map((entry, i) => `
  <div class="kids-card img-zoom-wrap">
   <img src="${assetUrl(entry.src)}" alt="Atendimento Kids ${i + 1}" style="${imageStyleAttr(entry.style)}">
   <div class="img-ver-overlay"><span>Ver</span></div>
  </div>
 `).join('')

 if (boomerang && boomerang.src) {
  boomerangSource.src = assetUrl(boomerang.src)
  boomerangVideo.load()
  boomerangWrap.style.display = ''
 } else {
  boomerangWrap.style.display = 'none'
 }
}

/*
  Track "Agendar" button clicks
*/
document.querySelectorAll('a[href="#contact"].button').forEach(btn => {
 btn.addEventListener('click', () => {
  fetch(apiUrl('/api/click'), {
   method: 'POST',
   credentials: 'include'
  }).catch(() => {})
 })
})

/*
  Load dynamic images from admin panel
*/
function loadDynamicImages() {
 fetch(apiUrl('/api/images'), { credentials: 'include' })
  .then(r => r.json())
  .then(data => {
   // Carrossel
   if (data.carrossel && data.carrossel.length > 0) {
    const wrapper = document.querySelector('.galeria-carousel .swiper-wrapper')
    const carouselItems = data.carrossel
    .map(normalizeImageEntry)
     .filter(Boolean)
    if (wrapper) {
    wrapper.innerHTML = carouselItems.map((entry, i) =>
    `<div class="galeria-slide swiper-slide"><img src="${assetUrl(entry.src)}" alt="Imagem ${i + 1}" style="${imageStyleAttr(entry.style)}"></div>`
     ).join('')
     if (carouselItems.length > 0) {
      swiper.update()
      setVisible('.galeria-carousel', true)
     } else {
      setVisible('.galeria-carousel', false)
     }
    }
   } else {
    setVisible('.galeria-carousel', false)
   }
   // Grid - filter out null positions
    renderGalleryGrid(data.grid)
   // Site images (capa, sobrenos, antes, depois)
   if (data.siteImages) {
    const siteMap = {
     capa:     { img: '#home .image img', block: '#home .image' },
     sobrenos: { img: '#about .image img', block: '#about .image' },
     antes:    { img: '#testimonials .antes img', block: '#testimonials .antes' },
     depois:   { img: '#testimonials .depois img', block: '#testimonials .depois' }
    }
    for (const [name, refs] of Object.entries(siteMap)) {
     const hasImage = !!(data.siteImages[name] && data.siteImages[name].src)
     setVisible(refs.block, hasImage)
     if (hasImage) {
      const el = document.querySelector(refs.img)
        if (el) {
         el.src = assetUrl(data.siteImages[name].src)
         applyImageEntry(el, data.siteImages[name])
        }
     }
    }

    const hasBefore = !!(data.siteImages.antes && data.siteImages.antes.src)
    const hasAfter = !!(data.siteImages.depois && data.siteImages.depois.src)
    setVisible('#testimonials', hasBefore && hasAfter)
   }

    renderKidsSection(data.kids)

   // Video
   if (data.video && data.video.src) {
    const videoSource = document.querySelector('.video-bg video source')
    const videoEl = document.querySelector('.video-bg video')
    if (videoSource && videoEl) {
     videoSource.src = assetUrl(data.video.src)
     videoEl.load()
     setVisible('.video-bg', true)
    }
   } else {
    setVisible('.video-bg', false)
   }
  })
  .catch(() => {
   restoreStaticGalleryGrid()
  }) // Fallback: keep static images if server is not running
}

enhanceGalleryGridWithViewButtons()
loadDynamicImages()

/*
  Scrollreveal mostra os elementos conforme a movimentação do scroll
*/
const scrollReveal = ScrollReveal({
 origin: top,
 distance: '0px',
 duration: 700,
 reset: false,
 viewFactor: 0.2
})

scrollReveal.reveal(
 `#home .image, #home .text, 
   #about .image, #about .text,
   #services .header, #services .card,
   #galeria .galeria-carousel, #galeria .video-bg,
   #testimonials header, #testimonials .testimonials,
   #contact .links,
   footer .brand, footer .social
   `,
 { interval: 100 }
)

/*
  Ocultar e mostrar botão de voltar para a home
*/
const backToHomeButton = document.querySelector('.back-to-home')

function backToHome() {
 if (window.scrollY >= 500) {
  backToHomeButton.classList.add('show')
 } else {
  backToHomeButton.classList.remove('show')
 }
}

/*
  On and Off section of page
*/
const sections = document.querySelectorAll('main section[id]')

function activateMenuAtCurrentSection() {
 const checkpoint = window.pageYOffset + (window.innerHeight / 8) * 4

 for (const section of sections) {
  const sectionTop = section.offsetTop
  const sectionHeight = section.offsetHeight
  const sectionId = section.getAttribute('id')
  const checkpointStart = checkpoint >= sectionTop
  const checkpointEnd = checkpoint <= sectionTop + sectionHeight

  if (checkpointStart && checkpointEnd) {
   document
    .querySelector('nav ul li a[href*=' + sectionId + ']')
    .classList.add('active')
  } else {
   document
    .querySelector('nav ul li a[href*=' + sectionId + ']')
    .classList.remove('active')
  }
 }
}

/* 
  When Scroll 
*/
window.addEventListener('scroll', function () {
 changeHeaderWhenScroll()
 backToHome()
 activateMenuAtCurrentSection()
})

/*
  Lightbox
*/
const lightbox = document.getElementById('lightbox')
const lightboxImg = document.getElementById('lightbox-img')

function openLightbox(src) {
 lightboxImg.src = src
 lightbox.classList.add('open')
 document.body.style.overflow = 'hidden'
}

function closeLightbox() {
 lightbox.classList.remove('open')
 lightboxImg.src = ''
 document.body.style.overflow = ''
}

document.getElementById('lightbox-close').addEventListener('click', (e) => {
 e.stopPropagation()
 closeLightbox()
})

lightbox.addEventListener('click', closeLightbox)
lightboxImg.addEventListener('click', (e) => e.stopPropagation())

document.addEventListener('keydown', (e) => {
 if (e.key === 'Escape') closeLightbox()
})

document.addEventListener('click', (e) => {
 const wrap = e.target.closest('.img-zoom-wrap')
 if (!wrap) return
 const img = wrap.querySelector('img')
 if (img) openLightbox(img.src)
})
