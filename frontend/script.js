// SIDEBAR
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// LOGOUT
function logout() {
  if (typeof api !== 'undefined' && api.removeToken) {
    api.removeToken();
  } else {
    localStorage.removeItem('token');
  }
  window.location.href = 'login.html';
}

// Charts are initialized in dashboard.html with live data from the API.
// This file intentionally does not create Chart instances.


// TABLES LOGIC (SAFE MODE)
const selectAllCheckbox = document.getElementById("selectAll");
if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", function () {
        const checkboxes = document.querySelectorAll("tbody input[type='checkbox']");
        checkboxes.forEach(cb => cb.checked = this.checked);
    });
}

// Column resizing & Dragging (Only run if table exists)
if (document.querySelector("table")) {
    document.querySelectorAll("th").forEach((th) => {
        th.addEventListener("mousedown", function (e) {
            if (e.offsetX > th.offsetWidth - 10) {
                const startX = e.pageX;
                const startWidth = th.offsetWidth;
                const onMouseMove = (e) => { th.style.width = `${startWidth + (e.pageX - startX)}px`; };
                const onMouseUp = () => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            }
        });
    });
    
    // Dragging Logic
    const tableBody = document.querySelector("tbody");
    if(tableBody) {
        let draggedRow = null;
        tableBody.addEventListener("dragstart", (e) => {
            draggedRow = e.target;
            e.target.style.opacity = 0.5;
        });
        tableBody.addEventListener("dragend", (e) => {
            if(e.target) e.target.style.opacity = "";
        });
        tableBody.addEventListener("dragover", (e) => {
            e.preventDefault();
            const targetRow = e.target.closest("tr");
            if (targetRow && targetRow !== draggedRow) {
                const bounding = targetRow.getBoundingClientRect();
                const offset = e.clientY - bounding.top - bounding.height / 2;
                if (offset > 0) targetRow.after(draggedRow);
                else targetRow.before(draggedRow);
            }
        });
        document.querySelectorAll("tbody tr").forEach((row) => row.draggable = true);
    }
}


// DRAWER LOGIC
function openDrawer() {
    const drawer = document.getElementById("drawer");
    if(drawer) drawer.classList.add("open");
}

function closeDrawer() {
    const drawer = document.getElementById("drawer");
    if(drawer) drawer.classList.remove("open");
}

// SHARED SEARCH LOGIC
function setupSearch(inputId, resultsId) {
    let searchTimeout;
    const searchInput = document.getElementById(inputId);
    const searchResults = document.getElementById(resultsId);

    if (!searchInput || !searchResults) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 2) {
            searchResults.classList.remove('active');
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                // Ensure api exists
                if(typeof api !== 'undefined' && api.search) {
                    const data = await api.search(query);
                    renderSearchResults(data, searchResults);
                }
            } catch (error) {
                console.error('Search failed', error);
            }
        }, 300); 
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });
}

function renderSearchResults(data, container) {
    container.innerHTML = '';
    const { users, products, offers } = data;
    let hasResults = false;

    // Users
    if (users && users.length > 0) {
        hasResults = true;
        container.innerHTML += `<div class="search-header">Users</div>`;
        users.forEach(u => {
            container.innerHTML += `
                <div class="search-item" onclick="window.location.href='users.html?id=${u.id}'">
                    <div class="item-main">${u.full_name || 'No Name'}</div>
                    <div class="item-sub">${u.email}</div>
                </div>`;
        });
    }

    // Products
    if (products && products.length > 0) {
        hasResults = true;
        container.innerHTML += `<div class="search-section"><div class="search-header">Products</div>`;
        products.forEach(p => {
            container.innerHTML += `
                <div class="search-item" onclick="window.location.href='products.html?id=${p.id}'">
                    <div class="item-main">${p.title}</div>
                    <div class="item-sub">${p.type} • $${p.price}</div>
                </div>`;
        });
        container.innerHTML += `</div>`;
    }

    // Offers
    if (offers && offers.length > 0) {
        hasResults = true;
        container.innerHTML += `<div class="search-section"><div class="search-header">Offers</div>`;
        offers.forEach(o => {
            container.innerHTML += `
                <div class="search-item" onclick="window.location.href='offers.html?id=${o.id}'">
                    <div class="item-main">${o.title}</div>
                    <div class="item-sub">${o.discount}% Off</div>
                </div>`;
        });
        container.innerHTML += `</div>`;
    }

    if (!hasResults) {
        container.innerHTML = `<div class="no-results">No results found</div>`;
    }

    container.classList.add('active');
}