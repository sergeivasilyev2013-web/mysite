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
    renderMessengerSection();
    renderPaymentSection();
    updateCheckoutLabel();
  }

  function cityMessengers() {
    var c = city();
    if (c.messengers && c.messengers.length) return c.messengers;
    if (c.messenger) return [c.messenger];
    return [];
  }

  function renderMessengerSection() {
    var wrap = document.getElementById("mz-messenger-section");
    var list = document.getElementById("mz-messenger-list");
    if (!wrap || !list) return;
    var messengers = cityMessengers();
    if (messengers.length <= 1) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    list.innerHTML = "";
    messengers.forEach(function (m, i) {
      var row = document.createElement("label");
      row.className = "mz-messenger-row";
      row.innerHTML =
        '<input type="radio" name="mz-messenger" value="' + i + '"' + (i === 0 ? " checked" : "") + ">" +
        "<span>" + (m.label || m.type) + "</span>";
      list.appendChild(row);
    });
  }

  function selectedMessenger() {
    var messengers = cityMessengers();
    if (!messengers.length) return null;
    var checked = document.querySelector('input[name="mz-messenger"]:checked');
    if (!checked) return messengers[0];
    return messengers[parseInt(checked.value, 10)] || messengers[0];
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
    var m = selectedMessenger();
    if (!m) { btn.textContent = t.checkoutWhatsapp || "Checkout"; return; }
    if (m.type === "zalo") btn.textContent = t.checkoutZalo || t.checkoutWhatsapp || "Checkout";
    else if (m.type === "telegram") btn.textContent = t.checkoutTelegram || t.checkoutWhatsapp || "Checkout";
    else btn.textContent = t.checkoutWhatsapp || "Checkout";
  }

  function renderProductGrid() {
    var grid = document.getElementById("mz-product-grid");
    if (!grid) return;
    grid.innerHTML = "";
    (city().products || []).forEach(function (p) {
      var card = document.createElement("div");
      card.className = "product-card";
      var imgHtml = p.image ? '<img class="product-photo" src="' + p.image + '" alt="' + p.name + '" loading="lazy">' : "";
      card.innerHTML =
        imgHtml +
        '<div class="name">' + p.name + "</div>" +
        '<div class="price">' + fmt(p.price) + " " + city().currency + " / " + p.unit + "</div>" +
        '<div class="add-row">' +
          '<button type="button" class="add-btn" data-add-to-cart="' + p.id + '">' + (t.addToCart || "Add to cart") + "</button>" +
          '<span class="in-cart">' + (t.inCart || "In cart") + ': <span data-qty-for="' + p.id + '">0</span></span>' +
        "</div>";
      grid.appendChild(card);
    });
  }

  // --- Map address picker (Leaflet + OpenStreetMap Nominatim, no API key) ---
  var leafletMap = null;
  var leafletMarker = null;
  var searchDebounce = null;

  function mapModalEl() {
    var el = document.getElementById("mz-map-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mz-map-modal";
    el.innerHTML =
      '<div class="mz-map-inner">' +
        '<div class="mz-map-head">' +
          '<input type="text" id="mz-map-search" placeholder="' + (t.searchStreet || "Search a street") + '">' +
          '<button type="button" id="mz-map-close">×</button>' +
        "</div>" +
        '<div id="mz-map-results"></div>' +
        '<div id="mz-map-canvas"></div>' +
        '<div class="mz-map-foot">' +
          '<span id="mz-map-picked"></span>' +
          '<button type="button" id="mz-map-confirm" disabled>' + (t.confirmLocation || "Use this address") + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function ensureLeaflet(cb) {
    if (window.L) return cb();
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    var script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
    script.onload = cb;
    document.head.appendChild(script);
  }

  var pickedAddress = null;

  function setPicked(label, lat, lon) {
    pickedAddress = { label: label, lat: lat, lon: lon };
    var el = document.getElementById("mz-map-picked");
    if (el) el.textContent = label;
    var btn = document.getElementById("mz-map-confirm");
    if (btn) btn.disabled = false;
  }

  function placeMarker(lat, lon) {
    var latlng = [lat, lon];
    if (!leafletMarker) {
      leafletMarker = L.marker(latlng, { draggable: true }).addTo(leafletMap);
      leafletMarker.on("dragend", function () {
        var p = leafletMarker.getLatLng();
        reverseGeocode(p.lat, p.lng);
      });
    } else {
      leafletMarker.setLatLng(latlng);
    }
    leafletMap.setView(latlng, 16);
  }

  function nominatimFetch(url, cb) {
    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(cb)
      .catch(function () { cb(null); });
  }

  function reverseGeocode(lat, lon) {
    placeMarker(lat, lon);
    nominatimFetch(
      "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lon,
      function (data) {
        var label = data && data.display_name ? data.display_name : lat.toFixed(5) + ", " + lon.toFixed(5);
        setPicked(label, lat, lon);
      }
    );
  }

  function renderSearchResults(items) {
    var box = document.getElementById("mz-map-results");
    if (!box) return;
    box.innerHTML = "";
    if (!items || !items.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "mz-map-result-row";
      row.textContent = it.display_name;
      row.addEventListener("click", function () {
        box.hidden = true;
        var lat = parseFloat(it.lat), lon = parseFloat(it.lon);
        placeMarker(lat, lon);
        setPicked(it.display_name, lat, lon);
        document.getElementById("mz-map-search").value = it.display_name;
      });
      box.appendChild(row);
    });
  }

  function searchAddress(query) {
    if (!query || query.length < 3) {
      renderSearchResults([]);
      return;
    }
    var c = city();
    var vb = c.mapBBox ? "&viewbox=" + c.mapBBox.join(",") + "&bounded=1" : "";
    nominatimFetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(query) + vb,
      function (data) { renderSearchResults(data || []); }
    );
  }

  function openMapPicker() {
    var modal = mapModalEl();
    modal.classList.add("open");
    pickedAddress = null;
    var confirmBtn = document.getElementById("mz-map-confirm");
    if (confirmBtn) confirmBtn.disabled = true;
    var pickedEl = document.getElementById("mz-map-picked");
    if (pickedEl) pickedEl.textContent = "";
    var searchInput = document.getElementById("mz-map-search");
    if (searchInput) searchInput.value = "";
    renderSearchResults([]);

    ensureLeaflet(function () {
      var c = city();
      var center = c.mapCenter || [41.6168, 41.6367];
      setTimeout(function () {
        if (!leafletMap) {
          leafletMap = L.map("mz-map-canvas").setView(center, 13);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19
          }).addTo(leafletMap);
          leafletMap.on("click", function (e) {
            reverseGeocode(e.latlng.lat, e.latlng.lng);
          });
        } else {
          leafletMap.setView(center, 13);
          leafletMap.invalidateSize();
        }
      }, 50);
    });
  }

  function closeMapPicker() {
    var modal = document.getElementById("mz-map-modal");
    if (modal) modal.classList.remove("open");
  }

  function confirmMapPick() {
    if (!pickedAddress) return;
    var addressField = document.getElementById("mz-address");
    if (addressField) addressField.value = pickedAddress.label;
    closeMapPicker();
  }

  document.addEventListener("change", function (e) {
    if (e.target && e.target.name === "mz-messenger") {
      updateCheckoutLabel();
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "mz-map-search") {
      clearTimeout(searchDebounce);
      var q = e.target.value;
      searchDebounce = setTimeout(function () { searchAddress(q); }, 500);
    }
  });

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

  function toast(msg) {
    var el = document.getElementById("mz-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "mz-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2500);
  }

  // zalo.me/{phone} is a long-standing, unfixed Zalo bug ("account does not
  // exist") for many numbers, so we never rely on that link. Instead: copy
  // the order text, then show the seller's real in-app QR code to scan.
  function zaloModalEl() {
    var el = document.getElementById("mz-zalo-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mz-zalo-modal";
    el.className = "mz-simple-modal";
    el.innerHTML =
      '<div class="mz-simple-modal-inner">' +
        '<button type="button" id="mz-zalo-close" class="mz-simple-modal-close">×</button>' +
        '<p>' + (t.zaloScan || "Scan this QR code in the Zalo app to open the chat, then paste your order (already copied).") + "</p>" +
        '<img src="' + (window.MZ_ZALO_QR || "") + '" alt="Zalo QR" class="mz-zalo-qr-img">' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function openZaloModal() {
    zaloModalEl().classList.add("open");
  }

  function closeZaloModal() {
    var el = document.getElementById("mz-zalo-modal");
    if (el) el.classList.remove("open");
  }

  function copyThenOpenZaloModal(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(t.zaloCopied || "Order text copied.");
        openZaloModal();
      }, openZaloModal);
    } else {
      openZaloModal();
    }
  }

  function submitOrder() {
    if (cartCount() === 0) return;
    var addressInput = document.getElementById("mz-address");
    var address = addressInput ? addressInput.value.trim() : "";
    if (!address) {
      if (addressInput) addressInput.focus();
      toast(t.addressRequired || "Please enter a delivery address");
      return;
    }
    var text = buildOrderText(address);
    var m = selectedMessenger();
    if (!m) return;

    if (m.type === "whatsapp") {
      window.open("https://wa.me/" + m.number + "?text=" + encodeURIComponent(text), "_blank");
    } else if (m.type === "telegram") {
      // Telegram has no prefill-text deep link for a regular chat/channel, so
      // copy the text and open the chat the same popup-safe way as WhatsApp.
      var win = window.open("https://t.me/" + m.username, "_blank");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          toast(t.telegramCopied || "Order text copied — paste it into the Telegram chat that just opened.");
        });
      }
    } else if (m.type === "zalo") {
      copyThenOpenZaloModal(text);
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("#mz-zalo-trigger")) {
      openZaloModal();
      return;
    }
    if (e.target.closest("#mz-zalo-close")) {
      closeZaloModal();
      return;
    }
    if (e.target.id === "mz-zalo-modal") {
      closeZaloModal();
      return;
    }
    if (e.target.closest("#mz-pick-on-map")) {
      openMapPicker();
      return;
    }
    if (e.target.closest("#mz-map-close")) {
      closeMapPicker();
      return;
    }
    if (e.target.closest("#mz-map-confirm")) {
      confirmMapPick();
      return;
    }
    if (e.target.id === "mz-map-modal") {
      closeMapPicker();
      return;
    }
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
