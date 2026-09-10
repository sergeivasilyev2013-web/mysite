(function () {
  "use strict";

  var cities = window.MZ_CITIES || null;
  var t = window.MZ_CART_TEXT || {};
  var activeCityId = null;

  // Order messages always go out in Russian, whatever language the storefront
  // is in, so the owner reads every order the same way.
  var RU = {
    orderTitle: "Новый заказ Microzelen",
    total: "Итого",
    address: "Адрес доставки",
    payment: "Оплата",
    companyId: "ID предприятия (юр. лицо)"
  };

  // --- Back-compat single-city mode (used when MZ_CITIES is not provided) ---
  if (!cities) {
    cities = {
      _default: {
        id: "_default",
        currency: window.MZ_CURRENCY || "",
        products: window.MZ_PRODUCTS || [],
        messenger: window.MZ_MESSENGER || { type: "whatsapp", number: "" },
        payments: window.MZ_PAYMENTS || null,
        addressPlaceholder: ""
      }
    };
  }

  function cityIds() {
    return Object.keys(cities);
  }

  function pickInitialCity() {
    var fallback = window.MZ_DEFAULT_CITY || cityIds()[0];
    try {
      var saved = localStorage.getItem("mz_city");
      if (saved && cities[saved]) return saved;
    } catch (e) {}
    return fallback;
  }

  function city() {
    return cities[activeCityId];
  }

  function cartKey() {
    return "mz_cart_v1_" + activeCityId;
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(cartKey());
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  var cart = {};

  function saveCart() {
    try {
      localStorage.setItem(cartKey(), JSON.stringify(cart));
    } catch (e) {}
  }

  function productById(id) {
    var products = city().products || [];
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

  function fmt(n) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
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
    saveCart();
    renderBadge();
    renderQty(id);
    renderCartPanel();
  }

  function removeItem(id) {
    if (!cart[id]) return;
    cart[id] -= 1;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
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
          '<span class="mz-cart-row-price">' + fmt(p.price * cart[id]) + "</span>";
        list.appendChild(row);
      });
    }
    if (totalEl) totalEl.textContent = fmt(cartTotal());
    var currencyEl = document.getElementById("mz-cart-currency");
    if (currencyEl) currencyEl.textContent = city().currency || "";
    renderPaymentSection();
    updateCheckoutLabel();
  }

  function renderPaymentSection() {
    var wrap = document.getElementById("mz-payment-section");
    var list = document.getElementById("mz-payment-list");
    if (!wrap || !list) return;
    var payments = city().payments;
    if (!payments || !payments.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    list.innerHTML = "";
    payments.forEach(function (p, i) {
      var row = document.createElement("label");
      row.className = "mz-payment-row";
      var qrHtml = p.qrImage ? '<br><img src="' + p.qrImage + '" alt="QR" class="mz-payment-qr">' : "";
      row.innerHTML =
        '<input type="radio" name="mz-payment" value="' + i + '"' + (i === 0 ? " checked" : "") + ">" +
        '<span><strong>' + p.bank + "</strong><br>" + p.holder + "<br><code>" + p.iban + "</code> " +
        '<button type="button" class="mz-copy-iban" data-iban="' + p.iban + '">' + (t.copy || "Copy") + "</button>" + qrHtml + "</span>";
      list.appendChild(row);
    });
  }

  function selectedPayment() {
    var payments = city().payments;
    var checked = document.querySelector('input[name="mz-payment"]:checked');
    if (!checked || !payments || !payments.length) return null;
    return payments[parseInt(checked.value, 10)];
  }

  function updateCheckoutLabel() {
    var btn = document.getElementById("mz-checkout-btn");
    if (!btn) return;
    var m = city().messenger;
    if (m.type === "zalo") btn.textContent = t.checkoutZalo || t.checkoutWhatsapp || "Checkout";
    else btn.textContent = t.checkoutWhatsapp || "Checkout";
  }

  function renderProductGrid() {
    var grid = document.getElementById("mz-product-grid");
    if (!grid) return;
    grid.innerHTML = "";
    (city().products || []).forEach(function (p) {
      var card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML =
        '<div class="name">' + p.name + "</div>" +
        '<div class="price">' + fmt(p.price) + " " + city().currency + " / " + p.unit + "</div>" +
        '<div class="add-row">' +
          '<button type="button" class="add-btn" data-add-to-cart="' + p.id + '">' + (t.addToCart || "Add to cart") + "</button>" +
          '<span class="in-cart">' + (t.inCart || "In cart") + ': <span data-qty-for="' + p.id + '">0</span></span>' +
        "</div>";
      grid.appendChild(card);
    });
  }

  function updateAddressPlaceholder() {
    var el = document.getElementById("mz-address");
    if (el) el.placeholder = city().addressPlaceholder || "";
  }

  function updateCityButtons() {
    document.querySelectorAll("[data-city-btn]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-city-btn") === activeCityId);
    });
    document.querySelectorAll("[data-city-note]").forEach(function (el) {
      el.hidden = el.getAttribute("data-city-note") !== activeCityId;
    });
  }

  function setCity(id) {
    if (!cities[id] || id === activeCityId) {
      if (!cities[id]) return;
    }
    activeCityId = id;
    try {
      localStorage.setItem("mz_city", id);
    } catch (e) {}
    cart = loadCart();
    renderProductGrid();
    renderBadge();
    (city().products || []).forEach(function (p) {
      renderQty(p.id);
    });
    renderCartPanel();
    updateAddressPlaceholder();
    updateCityButtons();
  }

  var BILINGUAL = !!window.MZ_BILINGUAL_MESSAGE;

  function biLabel(key) {
    var local = t[key];
    if (BILINGUAL && local && local !== RU[key]) return local + " / " + RU[key];
    return RU[key];
  }

  function biField(local, ru) {
    if (BILINGUAL && local && ru && local !== ru) return local + " / " + ru;
    return ru || local;
  }

  function buildOrderText(address) {
    var lines = [];
    lines.push(biLabel("orderTitle") + " (" + (city().label || activeCityId) + ")");
    lines.push("");
    Object.keys(cart).forEach(function (id) {
      var p = productById(id);
      if (!p) return;
      var name = biField(p.name, p.nameRu);
      var unit = biField(p.unit, p.unitRu);
      lines.push("- " + name + " x " + cart[id] + " " + unit + " = " + fmt(p.price * cart[id]));
    });
    lines.push("");
    lines.push(biLabel("total") + ": " + fmt(cartTotal()) + " " + city().currency);
    lines.push("");
    lines.push(biLabel("address") + ": " + address);
    var companyIdInput = document.getElementById("mz-company-id");
    var companyId = companyIdInput ? companyIdInput.value.trim() : "";
    if (companyId) {
      lines.push("");
      lines.push(biLabel("companyId") + ": " + companyId);
    }
    var pay = selectedPayment();
    if (pay) {
      lines.push("");
      lines.push(biLabel("payment") + ": " + pay.bank + " — " + pay.holder + " — " + pay.iban);
    }
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
    var m = city().messenger;

    if (m.type === "whatsapp") {
      window.open("https://wa.me/" + m.number + "?text=" + encodeURIComponent(text), "_blank");
    } else if (m.type === "zalo") {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          alert(t.zaloCopied || "Order text copied — paste it into the Zalo chat that just opened.");
          window.open("https://zalo.me/" + m.number, "_blank");
        }, function () {
          window.open("https://zalo.me/" + m.number, "_blank");
        });
      } else {
        window.open("https://zalo.me/" + m.number, "_blank");
      }
    }
  }

  document.addEventListener("click", function (e) {
    var cityBtn = e.target.closest("[data-city-btn]");
    if (cityBtn) {
      setCity(cityBtn.getAttribute("data-city-btn"));
      return;
    }
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
      return;
    }
    var copyBtn = e.target.closest(".mz-copy-iban");
    if (copyBtn) {
      var iban = copyBtn.getAttribute("data-iban");
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = t.copied || "Copied";
        setTimeout(function () {
          copyBtn.textContent = original;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(iban).then(done, done);
      } else {
        done();
      }
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    setCity(pickInitialCity());
  });
})();
