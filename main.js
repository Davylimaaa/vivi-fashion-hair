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
    if (wrapper) {
     wrapper.innerHTML = data.carrossel.map((img, i) =>
      `<div class="galeria-slide swiper-slide"><img src="${assetUrl(img.src)}" alt="Imagem ${i + 1}"></div>`
     ).join('')
     swiper.update()
    }
   }
   // Grid - filter out null positions
   if (data.grid) {
    const gridItems = data.grid.filter(img => img !== null)
    if (gridItems.length > 0) {
     const grid = document.querySelector('.grid-4x4')
     if (grid) {
      grid.innerHTML = gridItems.map((img, i) =>
       withViewOverlay(assetUrl(img.src), `Grid ${i + 1}`)
      ).join('')
     }
    }
   }
   // Site images (capa, sobrenos, antes, depois)
   if (data.siteImages) {
    const siteMap = {
     capa:     '#home .image img',
     sobrenos: '#about .image img',
     antes:    '#testimonials .antes img',
     depois:   '#testimonials .depois img'
    }
    for (const [name, selector] of Object.entries(siteMap)) {
     if (data.siteImages[name] && data.siteImages[name].src) {
      const el = document.querySelector(selector)
      if (el) el.src = assetUrl(data.siteImages[name].src)
     }
    }
   }
   // Video
   if (data.video && data.video.src) {
    const videoSource = document.querySelector('.video-bg video source')
    const videoEl = document.querySelector('.video-bg video')
    if (videoSource && videoEl) {
     videoSource.src = assetUrl(data.video.src)
     videoEl.load()
    }
   }
  })
  .catch(() => {}) // Fallback: keep static images if server is not running
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
   #galeria .galeria-carousel, #galeria .galeria-grid, #galeria .video-bg,
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
