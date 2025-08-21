// browse.js — client-side filters, search, and menu/drawer interactions
document.addEventListener('DOMContentLoaded', function () {
  const cards = Array.from(document.querySelectorAll('.card'));
  const searchInput = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');
  const categoryPills = Array.from(document.querySelectorAll('.category-pill'));
  const pricePills = Array.from(document.querySelectorAll('.price-pill'));
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const closeSidebar = document.getElementById('closeSidebar');

  let selectedCategory = 'All Games';
  let selectedPrice = 'all';
  let q = '';

  // Utility: update visibility of a card based on current filters
  function matchesFilters(card) {
    const title = (card.dataset.title || '').toLowerCase();
    const category = (card.dataset.category || '').toLowerCase();
    const price = parseFloat(card.dataset.price || '0');

    // Search match: title contains term
    if (q && !title.includes(q)) return false;

    // Category
    if (selectedCategory && selectedCategory.toLowerCase() !== 'all games') {
      if (selectedCategory.toLowerCase() !== category) return false;
    }

    // Price rules
    switch (selectedPrice) {
      case 'free':
        if (price !== 0) return false;
        break;
      case 'lt5':
        if (!(price > 0 && price < 5)) return false;
        break;
      case 'lt15':
        if (!(price > 0 && price < 15)) return false;
        break;
      // 'all' -> no restriction
    }

    return true;
  }

  function renderFilters() {
    cards.forEach(card => {
      if (matchesFilters(card)) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Search handlers
  searchInput.addEventListener('input', function (e) {
    q = (e.target.value || '').trim().toLowerCase();
    renderFilters();
  });

  clearBtn.addEventListener('click', function () {
    searchInput.value = '';
    q = '';
    renderFilters();
  });

  // Category pills: single-selection behavior
  categoryPills.forEach(p => {
    p.addEventListener('click', function () {
      categoryPills.forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      selectedCategory = p.dataset.category || 'All Games';
      renderFilters();
    });
  });

  // Price pills: single-selection
  pricePills.forEach(p => {
    p.addEventListener('click', function () {
      pricePills.forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      selectedPrice = p.dataset.price || 'all';
      renderFilters();
    });
  });

  // Menu / sidebar interactions
  function openSidebar() {
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('no-scroll');
  }
  function closeSidebarFn() {
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('no-scroll');
  }

  menuBtn.addEventListener('click', function () {
    // NEW: only open the sidebar for large screens (>=900px).
    // On mobile we don't open this sidebar (assume you have a mobile menu elsewhere).
    if (window.innerWidth >= 900) {
      if (sidebar.classList.contains('open')) {
        closeSidebarFn();
      } else {
        openSidebar();
      }
    } else {
      // mobile: do nothing (or you can hook your mobile menu here)
      // console.log('menu button on mobile - sidebar disabled (use mobile menu)');
    }
  });

  if (closeSidebar) closeSidebar.addEventListener('click', closeSidebarFn);

  // click outside to close sidebar (use capture)
  window.addEventListener('click', function (e) {
    if (!sidebar.classList.contains('open')) return;
    // if clicked outside sidebar and not the menu button -> close
    if (!sidebar.contains(e.target) && e.target !== menuBtn) {
      closeSidebarFn();
    }
  });

  // keyboard escape to close sidebar
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebarFn();
    }
  });

  // Initialize (render)
  renderFilters();
});


// (mantén el resto de tu browse.js igual) 
// Agrego la gestión de clicks en el side-nav para marcar la sección activa

document.addEventListener('DOMContentLoaded', function () {
  // ... existing code from browse.js (filters, menu open/close, etc) ...

  // Side nav interactions (mark active and optionally navigate)
  const sideItems = Array.from(document.querySelectorAll('.side-item'));
  sideItems.forEach(item => {
    item.addEventListener('click', function () {
      sideItems.forEach(i => {
        i.classList.remove('active');
        i.setAttribute('aria-pressed', 'false');
      });
      item.classList.add('active');
      item.setAttribute('aria-pressed', 'true');

      // opcional: cambia la vista / filtra según la sección
      const section = item.dataset.section;
      if (section === 'home') {
        // ejemplo: scroll to top / reset filters
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (section === 'notifications') {
        alert('Abrir notificaciones (placeholder)');
      } else if (section === 'wishlist') {
        alert('Abrir juegos deseados (placeholder)');
      } else if (section === 'library') {
        alert('Abrir librería (placeholder)');
      }

      // cerrar sidebar si se desea (opción)
      // closeSidebarFn(); // si quieres que se cierre al seleccionar
    });
  });

  // ... rest of existing browse.js ...
});
