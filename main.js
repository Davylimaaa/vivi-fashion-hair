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
       `<img src="${assetUrl(img.src)}" alt="Grid ${i + 1}">`
      ).join('')
     }
    }
   }
  })
  .catch(() => {}) // Fallback: keep static images if server is not running
}

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
