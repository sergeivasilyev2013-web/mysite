(function () {
  "use strict";

  var STORAGE_KEY = "mz_cart_v1";

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
  }

  var cart = loadCart();
  var products = window.MZ_PRODUCTS || [];
  var messenger = window.MZ_MESSENGER || { type: "whatsapp", number: "" };
  var t = window.MZ_CART_TEXT || {};

  function productById(id) {
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === id) return products[i];
    }
    return null;
  }

  function cartCount() {
    var n = 0;
    for (var id in cart) n += cart[id];
    return n;
  }

  function cartTotal() {
    var sum = 0;
    for (var id in cart) {
      var p = productById(id);
      if (p) sum += p.price * cart[id];
    }
    return sum;
  }

  function renderBadge() {
    var badge = document.getElementById("mz-cart-count");
    if (badge) badge.textContent = cartCount();
  }

  function renderQty(id) {
    var el = document.querySelector('[data-qty-for="' + id + '"]');
    if (el) el.textContent = cart[id] || 0;
  }

  function addItem(id) {
    cart[id] = (cart[id] || 0) + 1;
    saveCart(cart);
    renderBadge();
    renderQty(id);
    renderCartPanel();
  }

  function removeItem(id) {
    if (!cart[id]) return;
    cart[id] -= 1;
    if (cart[id] <= 0) delete cart[id];
    saveCart(cart);
    renderBadge();
    renderQty(id);
    renderCartPanel();
  }

  function renderCartPanel() {
    var list = document.getElementById("mz-cart-list");
    var totalEl = document.getElementById("mz-cart-total");
    if (!list) return;
    list.innerHTML = "";
    var ids = Object.keys(cart);
    if (ids.length === 0) {
      list.innerHTML = '<p class="mz-cart-empty">' + (t.empty || "Cart is empty") + "</p>";
    } else {
      ids.forEach(function (id) {
        var p = productById(id);
        if (!p) return;
        var row = document.createElement("div");
        row.className = "mz-cart-row";
        row.innerHTML =
          '<span class="mz-cart-row-name">' + p.name + "</span>" +
          '<span class="mz-cart-row-qty">' +
            '<button type="button" class="mz-qty-btn" data-action="dec" data-id="' + id + '">-</button>' +
            '<span class="mz-qty-val">' + cart[id] + "</span>" +
            '<button type="button" class="mz-qty-btn" data-action="inc" data-id="' + id + '">+</button>' +
          "</span>" +
          '<span class="mz-cart-row-price">' + (p.price * cart[id]).toFixed(2) + "</span>";
        list.appendChild(row);
      });
    }
    if (totalEl) totalEl.textContent = cartTotal().toFixed(2);
  }

  function buildOrderText(address) {
    var lines = [];
    lines.push(t.orderTitle || "New order:");
    lines.push("");
    Object.keys(cart).forEach(function (id) {
      var p = productById(id);
      if (!p) return;
      lines.push("- " + p.name + " x " + cart[id] + " " + p.unit + " = " + (p.price * cart[id]).toFixed(2));
    });
    lines.push("");
    lines.push((t.total || "Total") + ": " + cartTotal().toFixed(2));
    lines.push("");
    lines.push((t.address || "Delivery address") + ": " + address);
    return lines.join("\n");
  }

  function submitOrder() {
    if (cartCount() === 0) return;
    var addressInput = document.getElementById("mz-address");
    var address = addressInput ? addressInput.value.trim() : "";
    if (!address) {
      if (addressInput) addressInput.focus();
      alert(t.addressRequired || "Please enter a delivery address");
      return;
    }
    var text = buildOrderText(address);

    if (messenger.type === "whatsapp") {
      window.open("https://wa.me/" + messenger.number + "?text=" + encodeURIComponent(text), "_blank");
    } else if (messenger.type === "zalo") {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          alert(t.zaloCopied || "Order text copied — paste it into the Zalo chat that just opened.");
          window.open("https://zalo.me/" + messenger.number, "_blank");
        }, function () {
          window.open("https://zalo.me/" + messenger.number, "_blank");
        });
      } else {
        window.open("https://zalo.me/" + messenger.number, "_blank");
      }
    }
  }

  document.addEventListener("click", function (e) {
    var addBtn = e.target.closest("[data-add-to-cart]");
    if (addBtn) {
      addItem(addBtn.getAttribute("data-add-to-cart"));
      return;
    }
    var qtyBtn = e.target.closest(".mz-qty-btn");
    if (qtyBtn) {
      var id = qtyBtn.getAttribute("data-id");
      if (qtyBtn.getAttribute("data-action") === "inc") addItem(id);
      else removeItem(id);
      return;
    }
    if (e.target.closest("#mz-cart-toggle")) {
      var panel = document.getElementById("mz-cart-panel");
      if (panel) panel.classList.toggle("open");
      renderCartPanel();
      return;
    }
    if (e.target.closest("#mz-cart-close")) {
      var panel2 = document.getElementById("mz-cart-panel");
      if (panel2) panel2.classList.remove("open");
      return;
    }
    if (e.target.closest("#mz-checkout-btn")) {
      submitOrder();
    }
  });

  function currency() {
    return window.MZ_CURRENCY || "";
  }

  function renderProductGrid() {
    var grid = document.getElementById("mz-product-grid");
    if (!grid) return;
    grid.innerHTML = "";
    products.forEach(function (p) {
      var card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML =
        '<div class="name">' + p.name + "</div>" +
        '<div class="price">' + p.price + " " + currency() + " / " + p.unit + "</div>" +
        '<div class="add-row">' +
          '<button type="button" class="add-btn" data-add-to-cart="' + p.id + '">' + (t.addToCart || "Add to cart") + "</button>" +
          '<span class="in-cart">' + (t.inCart || "In cart") + ': <span data-qty-for="' + p.id + '">0</span></span>' +
        "</div>";
      grid.appendChild(card);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderProductGrid();
    renderBadge();
    products.forEach(function (p) {
      renderQty(p.id);
    });
    renderCartPanel();
  });
})();
