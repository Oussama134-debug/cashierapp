(() => {
  let products = [];
  let cart = [];
  let activeCategory = 'All';
  let employee = null;

  const toastContainer = document.getElementById('toast-container');
  const loginScreen = document.getElementById('login-screen');
  const pinInput = document.getElementById('pin-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const appEl = document.getElementById('app');
  const employeeBadge = document.getElementById('employee-badge');
  const productsGrid = document.getElementById('products-grid');
  const cartItemsEl = document.getElementById('cart-items');
  const cartTotalEl = document.getElementById('cart-total');
  const itemCountEl = document.getElementById('item-count');
  const searchInput = document.getElementById('search-input');
  const categoryFilters = document.getElementById('category-filters');
  const checkoutBtn = document.getElementById('checkout-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const stockBtn = document.getElementById('stock-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const paymentModal = document.getElementById('payment-modal');
  const paymentTotal = document.getElementById('payment-total');
  const paymentCustomerInput = document.getElementById('payment-customer-input');
  const paymentAmountInput = document.getElementById('payment-amount-input');
  const paymentChange = document.getElementById('payment-change');
  const paymentError = document.getElementById('payment-error');
  const paymentCancelBtn = document.getElementById('payment-cancel-btn');
  const paymentConfirmBtn = document.getElementById('payment-confirm-btn');
  const stockModal = document.getElementById('stock-modal');
  const stockCloseBtn = document.getElementById('stock-close-btn');
  const stockResetBtn = document.getElementById('stock-reset-btn');
  const lowStockList = document.getElementById('low-stock-list');
  const adjustSearch = document.getElementById('adjust-search');
  const adjustProductList = document.getElementById('adjust-product-list');
  const refillRequestList = document.getElementById('refill-request-list');
  const receiptModal = document.getElementById('receipt-modal');
  const receiptDetails = document.getElementById('receipt-details');
  const closeModal = document.querySelector('.close-btn');

  const categoryIcons = {
    Coffee: '☕', Tea: '🍵', Cold: '🧊', Food: '🥐', Drinks: '🥤',
  };

  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('sessionId', sessionId);
  }

  function headers() {
    return { 'Content-Type': 'application/json', 'X-Session-Id': sessionId };
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, { headers: headers(), ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
  }

  // --- Auth ---

  async function checkSession() {
    try {
      const res = await fetch('/api/me', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        employee = data.employee;
        showApp();
      }
    } catch (_) {}
  }

  async function handleLogin() {
    const pin = pinInput.value.trim();
    if (!pin) return;
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ pin }) });
      employee = data.employee;
      loginError.classList.add('hidden');
      pinInput.value = '';
      showApp();
    } catch (err) {
      loginError.classList.remove('hidden');
    }
  }

  function showApp() {
    loginScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    employeeBadge.textContent = `Logged in as ${employee.name}${employee.role === 'manager' ? ' (Manager)' : ''}`;
    fetchProducts();
    fetchCart();
  }

  function logout() {
    employee = null;
    cart = [];
    appEl.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginError.classList.add('hidden');
    pinInput.value = '';
    pinInput.focus();
    renderCart();
  }

  // --- Products ---

  async function fetchProducts() {
    try {
      products = await api('/api/products');
      renderCategories();
      renderProducts();
    } catch (err) {
      console.error('Failed to load products', err);
    }
  }

  async function fetchCart() {
    try {
      cart = await api('/api/cart');
      renderCart();
    } catch (err) {
      console.error('Failed to load cart', err);
    }
  }

  function getCategories() {
    const cats = [...new Set(products.map(p => p.category))];
    return ['All', ...cats];
  }

  function renderCategories() {
    const cats = getCategories();
    categoryFilters.innerHTML = cats.map(c =>
      `<button class="cat-btn ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
  }

  function renderProducts() {
    const search = searchInput.value.toLowerCase();
    const filtered = products.filter(p => {
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      const matchSearch = p.name.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });

    productsGrid.innerHTML = filtered.map(p => {
      const stock = p.stock;
      const stockClass = stock <= 0 ? 'out' : stock <= 3 ? 'low' : 'ok';
      const stockLabel = stock <= 0 ? 'Out' : stock;
      const disabled = stock <= 0 ? 'disabled' : '';
      const isManager = employee && employee.role === 'manager';
      const requestIcon = isManager && stock <= 3 ? `<span class="stock-request-icon" data-id="${p.id}" title="Request refill">📦</span>` : '';
      return `
        <div class="product-card ${disabled}" data-id="${p.id}">
          ${requestIcon}
          <div class="product-icon">${categoryIcons[p.category] || '📦'}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-price">$${p.price.toFixed(2)}</div>
          <span class="stock-badge ${stockClass}">${stockLabel}</span>
        </div>
      `;
    }).join('');
  }

  // --- Cart ---

  async function addToCart(productId) {
    const p = products.find(x => x.id === productId);
    if (p && p.stock <= 0) { showToast('Out of stock!', 'error'); return; }
    try {
      cart = await api('/api/cart/add', { method: 'POST', body: JSON.stringify({ id: productId }) });
      renderCart();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function removeFromCart(productId) {
    try {
      cart = await api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ id: productId }) });
      renderCart();
    } catch (err) {
      console.error('Failed to remove item', err);
    }
  }

  async function updateQuantity(productId, delta) {
    try {
      cart = await api('/api/cart/update', { method: 'POST', body: JSON.stringify({ id: productId, delta }) });
      renderCart();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function clearCart() {
    const items = [...cart];
    for (const item of items) {
      cart = await api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ id: item.id }) });
    }
    renderCart();
  }

  function renderCart() {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    cartTotalEl.textContent = `$${total.toFixed(2)}`;
    itemCountEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p style="color:#aaa;text-align:center;margin-top:40px;">No items in sale</p>';
      checkoutBtn.disabled = true;
      cancelBtn.disabled = true;
      return;
    }

    checkoutBtn.disabled = false;
    cancelBtn.disabled = false;

    cartItemsEl.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-down">−</button>
          <span>${item.quantity}</span>
          <button class="qty-up">+</button>
        </div>
        <div class="cart-item-total">$${(item.price * item.quantity).toFixed(2)}</div>
        <button class="remove-item">&times;</button>
      </div>
    `).join('');
  }

  // --- Payment ---

  function openPayment() {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    paymentTotal.textContent = `Total: $${total.toFixed(2)}`;
    paymentCustomerInput.value = '';
    paymentAmountInput.value = '';
    paymentChange.textContent = 'Change: $0.00';
    paymentError.classList.add('hidden');
    paymentModal.classList.remove('hidden');
    setTimeout(() => paymentAmountInput.focus(), 100);
  }

  function updateChange() {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const given = parseFloat(paymentAmountInput.value) || 0;
    if (given < total) {
      paymentChange.textContent = 'Change: $0.00';
      paymentChange.style.color = '#e74c3c';
      paymentError.classList.remove('hidden');
      paymentConfirmBtn.disabled = true;
    } else {
      paymentChange.textContent = `Change: $${(given - total).toFixed(2)}`;
      paymentChange.style.color = '#27ae60';
      paymentError.classList.add('hidden');
      paymentConfirmBtn.disabled = false;
    }
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const amountPaid = parseFloat(paymentAmountInput.value) || 0;
    if (amountPaid < total) return;
    const customerName = paymentCustomerInput.value.trim();

    try {
      const receipt = await api('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ payment: 'cash', customerName, amountPaid }),
      });
      paymentModal.classList.add('hidden');
      showReceipt(receipt);
      cart = [];
      renderCart();
      fetchProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // --- Receipt ---

  function showReceipt(receipt) {
    receiptDetails.innerHTML = `
      <p style="text-align:center;color:#888;margin-bottom:4px;">#${receipt.id}</p>
      <p style="text-align:center;color:#888;margin-bottom:12px;">${new Date(receipt.date).toLocaleString()}</p>
      <p style="text-align:center;font-weight:600;margin-bottom:8px;">Customer: ${receipt.customerName}</p>
      ${receipt.items.map(item => `
        <div class="receipt-item">
          <span>${item.quantity}x ${item.name}</span>
          <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      `).join('')}
      <div class="receipt-total">
        <span>Total</span>
        <span>$${receipt.total.toFixed(2)}</span>
      </div>
      <div class="receipt-change">
        <span>Paid</span>
        <span>$${receipt.amountPaid.toFixed(2)}</span>
      </div>
      <div class="receipt-change">
        <span>Change</span>
        <span>$${receipt.change.toFixed(2)}</span>
      </div>
      <p style="text-align:center;color:#27ae60;margin-top:12px;font-weight:600;">Ticket saved to /tickets/</p>
    `;
    receiptModal.classList.remove('hidden');
  }

  // --- Stock Management ---

  function openStockModal() {
    stockModal.classList.remove('hidden');
    const isManager = employee.role === 'manager';

    document.querySelectorAll('.stock-tab').forEach(t => t.classList.toggle('hidden', t.dataset.tab === 'adjust' && !isManager));

    stockResetBtn.classList.toggle('hidden', !isManager);
    renderLowStock();
    if (isManager) renderAdjustList();
    renderRefillRequests();
  }

  async function renderLowStock() {
    const isManager = employee.role === 'manager';
    try {
      const low = await api('/api/products/low-stock');
      if (low.length === 0) {
        lowStockList.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px 0;">All products are well stocked</p>';
        return;
      }
      lowStockList.innerHTML = low.map(p => {
        const stockClass = p.stock <= 0 ? 'out' : 'low';
        const stockLabel = p.stock <= 0 ? 'Out of stock' : `${p.stock} left`;
        return `
          <div class="stock-item">
            <div class="stock-item-info">
              <div class="stock-item-name">${p.name}</div>
              <div class="stock-item-stock" style="color:${p.stock <= 0 ? '#e74c3c' : '#e67e22'}">${stockLabel}</div>
            </div>
            <div class="stock-item-actions">
              ${isManager ? `<button class="btn-primary" onclick="window._requestRefill(${p.id}, '${p.name}')">Request</button>
              <button onclick="window._quickAdjust(${p.id}, '${p.name}', ${p.stock})">Adjust</button>` : '<span style="color:#aaa;font-size:12px;">Contact manager for refill</span>'}
            </div>
          </div>
        `;
      }).join('');
    } catch (_) {
      lowStockList.innerHTML = '<p style="color:#e74c3c;">Failed to load</p>';
    }
  }

  function renderAdjustList() {
    const q = (adjustSearch.value || '').toLowerCase();
    const filtered = products.filter(p => p.name.toLowerCase().includes(q));

    adjustProductList.innerHTML = filtered.map(p => `
      <div class="adjust-row" data-id="${p.id}">
        <span class="adjust-name">${p.name}</span>
        <span class="adjust-stock">${p.stock}</span>
        <input type="number" class="adjust-qty" value="0" step="1">
        <select class="adjust-reason">
          <option value="Miscount">Miscount</option>
          <option value="Theft">Theft</option>
          <option value="Fire">Fire</option>
          <option value="Customer dispute">Customer dispute</option>
          <option value="Return">Return</option>
          <option value="Other">Other</option>
        </select>
        <button class="apply-btn" data-id="${p.id}">Apply</button>
      </div>
    `).join('');

    adjustProductList.querySelectorAll('.apply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.adjust-row');
        const id = parseInt(row.dataset.id);
        const qty = parseInt(row.querySelector('.adjust-qty').value) || 0;
        const reason = row.querySelector('.adjust-reason').value;
        if (qty === 0) { showToast('Enter a quantity change', 'warning'); return; }
        try {
          await api('/api/stock/adjust', { method: 'POST', body: JSON.stringify({ productId: id, quantity: qty, reason }) });
          const product = products.find(p => p.id === id);
          showToast(`Adjusted ${product.name} by ${qty > 0 ? '+' : ''}${qty} (${reason})`, 'info');
          fetchProducts();
          renderLowStock();
          renderAdjustList();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  async function renderRefillRequests() {
    const isManager = employee.role === 'manager';
    try {
      const requests = await api('/api/delivery/requests?status=pending');
      if (requests.length === 0) {
        refillRequestList.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px 0;">No pending refill requests</p>';
        return;
      }
      refillRequestList.innerHTML = requests.map(r => `
        <div class="refill-item" data-id="${r.id}">
          <div class="refill-item-info">
            <div class="refill-product">${r.product_name} x${r.quantity}</div>
            <div class="refill-meta">by ${r.employee_name} — ${new Date(r.created_at).toLocaleString()}</div>
          </div>
          ${isManager ? `<button class="stock-item-action-btn btn-success fulfill-btn" data-id="${r.id}">✓ Received</button>` : '<span style="color:#aaa;font-size:12px;">Awaiting manager</span>'}
        </div>
      `).join('');

      if (isManager) {
        refillRequestList.querySelectorAll('.fulfill-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id);
            try {
              const data = await api(`/api/delivery/fulfill/${id}`, { method: 'POST' });
              showToast(`Delivery received: +${data.quantity}`, 'success');
              fetchProducts();
              renderRefillRequests();
              renderLowStock();
              renderAdjustList();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      }
    } catch (_) {
      refillRequestList.innerHTML = '<p style="color:#e74c3c;">Failed to load</p>';
    }
  }

  window._requestRefill = async function(productId, productName) {
    const qty = prompt(`Refill quantity for ${productName}:`, '10');
    if (!qty || parseInt(qty) <= 0) return;
    try {
      const data = await api('/api/delivery/request', { method: 'POST', body: JSON.stringify({ productId, quantity: parseInt(qty) }) });
      showToast(`📦 Refill requested for ${data.productName} x${data.quantity}`, 'warning');
      renderRefillRequests();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window._quickAdjust = function(productId, productName, currentStock) {
    const qty = prompt(`Adjust stock for ${productName} (current: ${currentStock})\nEnter positive to add, negative to remove:`, '0');
    if (qty === null || qty === '' || parseInt(qty) === 0) return;
    const reason = prompt('Reason (Miscount / Theft / Fire / Customer dispute / Return / Other):', 'Miscount');
    if (!reason) return;
    (async () => {
      try {
        await api('/api/stock/adjust', { method: 'POST', body: JSON.stringify({ productId, quantity: parseInt(qty), reason }) });
        showToast(`Adjusted ${productName} by ${parseInt(qty) > 0 ? '+' : ''}${qty}`, 'info');
        fetchProducts();
        renderLowStock();
        renderAdjustList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    })();
  };

  async function handleResetStocks() {
    if (!confirm('⚠️ Reset ALL product stock to default values?\nThis cannot be undone.')) return;
    try {
      const data = await api('/api/stock/reset', { method: 'POST' });
      showToast('🔄 All stocks reset to defaults', 'success');
      products = data.products;
      renderProducts();
      renderLowStock();
      renderAdjustList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // --- Tab switching ---

  function switchStockTab(tabId) {
    document.querySelectorAll('.stock-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.stock-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`.stock-tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    if (tabId === 'low') renderLowStock();
    if (tabId === 'refills') renderRefillRequests();
  }

  // --- Event listeners ---

  loginBtn.addEventListener('click', handleLogin);
  pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  logoutBtn.addEventListener('click', () => {
    if (cart.length > 0 && !confirm('Cancel current sale and logout?')) return;
    logout();
  });

  productsGrid.addEventListener('click', e => {
    const requestIcon = e.target.closest('.stock-request-icon');
    if (requestIcon) {
      const id = parseInt(requestIcon.dataset.id);
      const p = products.find(x => x.id === id);
      if (p) window._requestRefill(id, p.name);
      return;
    }
    const card = e.target.closest('.product-card');
    if (!card) return;
    addToCart(parseInt(card.dataset.id));
  });

  categoryFilters.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    renderProducts();
  });

  cartItemsEl.addEventListener('click', e => {
    const itemEl = e.target.closest('.cart-item');
    if (!itemEl) return;
    const id = parseInt(itemEl.dataset.id);
    if (e.target.classList.contains('qty-up')) updateQuantity(id, 1);
    else if (e.target.classList.contains('qty-down')) updateQuantity(id, -1);
    else if (e.target.classList.contains('remove-item')) removeFromCart(id);
  });

  searchInput.addEventListener('input', renderProducts);
  checkoutBtn.addEventListener('click', openPayment);
  paymentAmountInput.addEventListener('input', updateChange);
  paymentConfirmBtn.addEventListener('click', handleCheckout);
  paymentCancelBtn.addEventListener('click', () => paymentModal.classList.add('hidden'));
  paymentAmountInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !paymentConfirmBtn.disabled) handleCheckout();
  });

  cancelBtn.addEventListener('click', () => {
    if (cart.length > 0 && confirm('Cancel this sale?')) clearCart();
  });

  stockBtn.addEventListener('click', openStockModal);
  stockCloseBtn.addEventListener('click', () => stockModal.classList.add('hidden'));
  stockResetBtn.addEventListener('click', handleResetStocks);

  document.querySelectorAll('.stock-tab').forEach(tab => {
    tab.addEventListener('click', () => switchStockTab(tab.dataset.tab));
  });

  adjustSearch.addEventListener('input', renderAdjustList);

  closeModal.addEventListener('click', () => receiptModal.classList.add('hidden'));
  window.addEventListener('click', e => {
    if (e.target === receiptModal) receiptModal.classList.add('hidden');
    if (e.target === paymentModal) paymentModal.classList.add('hidden');
    if (e.target === stockModal) stockModal.classList.add('hidden');
  });

  checkSession();
})();
