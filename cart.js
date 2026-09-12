(function () {
  "use strict";

  var cities = window.MZ_CITIES || null;
  var t = window.MZ_CART_TEXT || {};
  var activeCityId = null;

  // Gift promo (free delivery + a bonus tray) runs through the end of
  // September; past this it self-disables without needing a manual removal.
  var PROMO_END = new Date("2026-10-01T00:00:00");
  function promoActive() {
    return new Date() < PROMO_END;
  }

  // Order messages always go out in Russian, whatever language the storefront
  // is in, so the owner reads every order the same way.
  var RU = {
    orderTitle: "Новый заказ Microzelen",
    subtotal: "Товары",
    delivery: "Доставка",
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

  // Weight items (sold by the gram, e.g. Mash) store grams in cart[id]
  // instead of a tray count, so they need their own accounting everywhere
  // quantity or price is derived from the cart.
  function isWeightItem(p) {
    return !!(p && p.saleType === "weight");
  }

  function lineTotal(p, qty) {
    return isWeightItem(p) ? (p.pricePer100 * qty) / 100 : p.price * qty;
  }

  // Badge / empty-cart checks: a weight item counts as one line, not by
  // gram count, so the cart icon never shows a raw gram number.
  function cartCount() {
    var n = 0;
    for (var id in cart) {
      var p = productById(id);
      n += isWeightItem(p) ? 1 : cart[id];
    }
    return n;
  }

  // Trays only — used for the free-delivery / gift-box threshold. Weight
  // items aren't sold by the tray, so they never count toward it.
  function trayCount() {
    var n = 0;
    for (var id in cart) {
      var p = productById(id);
      if (isWeightItem(p)) continue;
      n += cart[id];
    }
    return n;
  }

  function cartTotal() {
    var sum = 0;
    for (var id in cart) {
      var p = productById(id);
      if (p) sum += lineTotal(p, cart[id]);
    }
    return sum;
  }

  function meetsPromoThreshold() {
    var c = city();
    var meetsCount = c.freeDeliveryMinCount && trayCount() >= c.freeDeliveryMinCount;
    var meetsTotal = c.freeDeliveryMinTotal && cartTotal() >= c.freeDeliveryMinTotal;
    return !!(meetsCount || meetsTotal);
  }

  // Club card: a one-time 10 GEL purchase, checked on trust like the gift
  // checkbox — there's no backend to actually verify a card number against,
  // so the seller confirms it the same way they confirm payment for orders.
  function hasClubCard() {
    var c = city();
    if (!c.clubCard) return false;
    var el = document.getElementById("mz-club-card");
    return !!(el && el.value.trim());
  }

  function fmt(n) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function discountedSubtotal() {
    var sub = cartTotal();
    return hasClubCard() ? sub * 0.9 : sub;
  }

  function deliveryFee() {
    var c = city();
    if (!c.deliveryFee || cartCount() === 0) return 0;
    if (hasClubCard() || meetsPromoThreshold()) return 0;
    return c.deliveryFee;
  }

  function grandTotal() {
    return discountedSubtotal() + deliveryFee();
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

  function setWeight(id, grams) {
    var p = productById(id);
    if (!p) return;
    var min = p.minGrams || 100;
    var step = p.stepGrams || 50;
    grams = Math.round(grams / step) * step;
    if (grams < min) grams = min;
    cart[id] = grams;
    saveCart();
    renderBadge();
    renderQty(id);
    renderCartPanel();
  }

  function adjustWeight(id, dir) {
    var p = productById(id);
    if (!p) return;
    var step = p.stepGrams || 50;
    var min = p.minGrams || 100;
    var grams = (cart[id] || 0) + dir * step;
    if (grams < min) delete cart[id];
    else cart[id] = grams;
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
        var decAction = isWeightItem(p) ? "dec-weight" : "dec";
        var incAction = isWeightItem(p) ? "inc-weight" : "inc";
        var qtyLabel = isWeightItem(p) ? cart[id] + " " + p.unit : cart[id];
        row.innerHTML =
          '<span class="mz-cart-row-name">' + p.name + "</span>" +
          '<span class="mz-cart-row-qty">' +
            '<button type="button" class="mz-qty-btn" data-action="' + decAction + '" data-id="' + id + '">-</button>' +
            '<span class="mz-qty-val">' + qtyLabel + "</span>" +
            '<button type="button" class="mz-qty-btn" data-action="' + incAction + '" data-id="' + id + '">+</button>' +
          "</span>" +
          '<span class="mz-cart-row-price">' + fmt(lineTotal(p, cart[id])) + "</span>";
        list.appendChild(row);
      });
    }
    if (totalEl) totalEl.textContent = fmt(grandTotal());
    var currencyEl = document.getElementById("mz-cart-currency");
    if (currencyEl) currencyEl.textContent = city().currency || "";

    var fee = deliveryFee();
    var deliveryRow = document.getElementById("mz-delivery-row");
    if (deliveryRow) {
      var c = city();
      deliveryRow.hidden = !c.deliveryFee || cartCount() === 0;
      var feeEl = document.getElementById("mz-delivery-fee");
      if (feeEl) feeEl.textContent = fee > 0 ? fmt(fee) + " " + c.currency : (t.freeDelivery || "Free");
      var noteEl = document.getElementById("mz-delivery-note");
      if (noteEl && c.freeDeliveryMinCount && c.freeDeliveryMinTotal) {
        noteEl.textContent = (t.deliveryNote || "Free from {count} trays or {total}")
          .replace("{count}", c.freeDeliveryMinCount)
          .replace("{total}", fmt(c.freeDeliveryMinTotal) + " " + c.currency);
      }
    }

    var discountRow = document.getElementById("mz-discount-row");
    if (discountRow) {
      var withCard = hasClubCard();
      discountRow.hidden = !withCard || cartCount() === 0;
      if (withCard) {
        var discountEl = document.getElementById("mz-discount-amount");
        if (discountEl) discountEl.textContent = "-" + fmt(cartTotal() - discountedSubtotal()) + " " + (city().currency || "");
      }
    }

    renderClubCardSection();
    renderGiftSection();
    renderMessengerSection();
    renderPaymentSection();
    updateCheckoutLabel();
  }

  function renderClubCardSection() {
    var wrap = document.getElementById("mz-club-card-section");
    if (!wrap) return;
    wrap.hidden = !city().clubCard;
  }

  function renderGiftSection() {
    var wrap = document.getElementById("mz-gift-section");
    if (!wrap) return;
    var c = city();
    if (!c.giftPromo || !promoActive()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var eligible = meetsPromoThreshold();
    var checkbox = document.getElementById("mz-gift-checkbox");
    var row = document.getElementById("mz-gift-row");
    if (checkbox) {
      checkbox.disabled = !eligible;
      if (!eligible) checkbox.checked = false;
    }
    if (row) row.classList.toggle("disabled", !eligible);
  }

  function cityMessengers() {
    var c = city();
    if (c.messengers && c.messengers.length) return c.messengers;
    if (c.messenger) return [c.messenger];
    return [];
  }

  // Hero/footer WhatsApp links are static HTML, not part of the cart panel,
  // so they need their own sync whenever the active city (and its WhatsApp
  // number) changes.
  function updateStaticWhatsapp() {
    var wa = cityMessengers().filter(function (m) { return m.type === "whatsapp"; })[0];
    if (!wa) return;
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach(function (a) {
      a.href = "https://wa.me/" + wa.number;
    });
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
    var amount = grandTotal();
    var amountLabel = amount > 0 ? fmt(amount) + " " + (city().currency || "") : "";
    payments.forEach(function (p, i) {
      var row = document.createElement("label");
      row.className = "mz-payment-row";
      var logoHtml = p.logo ? '<img src="' + p.logo + '" alt="" class="mz-bank-logo">' : "";
      var qrSrc = p.qrImage || "";
      if (p.qrBankId && amount > 0) {
        // addInfo/accountName ride Vietnam's interbank rails, which only accept
        // plain ASCII, so this is deliberately not the localized transferPurpose.
        var info = encodeURIComponent(p.qrNote || "Microzelen order");
        var name = encodeURIComponent(p.holder || "");
        qrSrc = "https://img.vietqr.io/image/" + p.qrBankId + "-" + p.iban + "-qr_only.png?amount=" + Math.round(amount) + "&addInfo=" + info + "&accountName=" + name;
      }
      var qrFallback = qrSrc !== p.qrImage && p.qrImage ? " onerror=\"this.onerror=null;this.src='" + p.qrImage + "';\"" : "";
      var qrHtml = qrSrc ? '<br><img src="' + qrSrc + '" alt="QR"' + qrFallback + ' class="mz-payment-qr">' : "";
      var amountHtml = amountLabel ? '<div class="mz-pay-amount">' + (t.amountToPay || "Amount due") + ": <strong>" + amountLabel + "</strong></div>" : "";
      row.innerHTML =
        '<input type="radio" name="mz-payment" value="' + i + '"' + (i === 0 ? " checked" : "") + ">" +
        '<span><span class="mz-bank-name">' + logoHtml + '<strong>' + p.bank + "</strong></span><br>" + p.holder + "<br><code>" + p.iban + "</code> " +
        '<button type="button" class="mz-copy-iban" data-iban="' + p.iban + '">' + (t.copy || "Copy") + "</button>" +
        amountHtml + qrHtml + "</span>";
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
      var descHtml = p.desc ? '<div class="desc">' + p.desc + "</div>" : "";
      var priceHtml, addRowHtml;
      if (isWeightItem(p)) {
        var minG = p.minGrams || 100;
        var stepG = p.stepGrams || 50;
        priceHtml = '<div class="price">' + fmt(p.pricePer100) + " " + city().currency + " / 100 " + p.unit + "</div>";
        addRowHtml =
          '<div class="add-row weight-row">' +
            '<input type="number" class="weight-input" data-weight-for="' + p.id + '" min="' + minG + '" step="' + stepG + '" value="' + minG + '">' +
            '<button type="button" class="add-btn" data-add-weight="' + p.id + '">' + (t.addToCart || "Add to cart") + "</button>" +
          "</div>" +
          '<span class="in-cart">' + (t.inCart || "In cart") + ': <span data-qty-for="' + p.id + '">0</span> ' + p.unit + "</span>";
      } else {
        priceHtml = '<div class="price">' + fmt(p.price) + " " + city().currency + " / " + p.unit + "</div>";
        addRowHtml =
          '<div class="add-row">' +
            '<button type="button" class="add-btn" data-add-to-cart="' + p.id + '">' + (t.addToCart || "Add to cart") + "</button>" +
            '<span class="in-cart">' + (t.inCart || "In cart") + ': <span data-qty-for="' + p.id + '">0</span></span>' +
          "</div>";
      }
      card.innerHTML = imgHtml + '<div class="name">' + p.name + "</div>" + descHtml + priceHtml + addRowHtml;
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
    if (e.target && e.target.id === "mz-club-card") {
      renderCartPanel();
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
    // The promo banner is also city-scoped via data-city-note, but it must
    // additionally disappear for good once the promo ends, even after a
    // later city switch would otherwise re-show it.
    var promoBanner = document.getElementById("mz-promo-banner");
    if (promoBanner && !promoActive()) promoBanner.hidden = true;
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
    updateStaticWhatsapp();
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
      if (isWeightItem(p)) {
        lines.push("- " + name + " " + cart[id] + " " + unit + " = " + fmt(lineTotal(p, cart[id])));
      } else {
        lines.push("- " + name + " x " + cart[id] + " " + unit + " = " + fmt(lineTotal(p, cart[id])));
      }
    });
    lines.push("");
    var fee = deliveryFee();
    var withCard = hasClubCard();
    if (fee > 0 || withCard) {
      lines.push(biLabel("subtotal") + ": " + fmt(cartTotal()) + " " + city().currency);
      if (withCard) {
        lines.push("Скидка по клубной карте (10%): -" + fmt(cartTotal() - discountedSubtotal()) + " " + city().currency);
      }
      lines.push(biLabel("delivery") + ": " + (fee > 0 ? fmt(fee) + " " + city().currency : (t.freeDelivery || "Free")));
    }
    lines.push(biLabel("total") + ": " + fmt(grandTotal()) + " " + city().currency);
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
    var giftCheckbox = document.getElementById("mz-gift-checkbox");
    if (giftCheckbox && giftCheckbox.checked && !giftCheckbox.disabled) {
      lines.push("");
      lines.push("🎁 Клиент хочет подарочный бокс (акция, лоток ≤14 ₾ на ваш выбор)");
    }
    if (withCard) {
      var cardInput = document.getElementById("mz-club-card");
      lines.push("");
      lines.push("💳 Клубная карта № " + cardInput.value.trim() + " — проверьте перед подтверждением");
    }
    return lines.join("\n");
  }

  // Cloud copy of the order for the admin dashboard (admin.html). Firebase
  // is optional progressive enhancement: if firebase-config.js hasn't been
  // filled in yet (or the SDK failed to load), window.MZ_DB is undefined and
  // this is a no-op — the WhatsApp/Telegram/Zalo flow above still works on
  // its own, exactly as before this existed.
  function buildOrderData(address) {
    var c = city();
    var items = Object.keys(cart).map(function (id) {
      var p = productById(id);
      if (!p) return null;
      return {
        name: p.nameRu || p.name,
        qty: cart[id],
        unit: p.unitRu || p.unit,
        weight: isWeightItem(p),
        lineTotal: lineTotal(p, cart[id])
      };
    }).filter(Boolean);
    var pay = selectedPayment();
    var m = selectedMessenger();
    var giftCheckbox = document.getElementById("mz-gift-checkbox");
    var cardInput = document.getElementById("mz-club-card");
    var companyIdInput = document.getElementById("mz-company-id");
    return {
      lang: document.documentElement.lang || "ru",
      cityId: activeCityId,
      cityLabel: c.label || activeCityId,
      items: items,
      subtotal: cartTotal(),
      discount: cartTotal() - discountedSubtotal(),
      deliveryFee: deliveryFee(),
      total: grandTotal(),
      currency: c.currency || "",
      address: address,
      companyId: companyIdInput && companyIdInput.value.trim() ? companyIdInput.value.trim() : null,
      payment: pay ? { bank: pay.bank, holder: pay.holder, iban: pay.iban } : null,
      giftRequested: !!(giftCheckbox && giftCheckbox.checked && !giftCheckbox.disabled),
      clubCard: hasClubCard() && cardInput ? cardInput.value.trim() : null,
      messenger: m ? m.type : null
    };
  }

  function saveOrderToCloud(address, text) {
    if (!window.MZ_DB) return;
    var data = buildOrderData(address);
    data.rawText = text;
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    window.MZ_DB.collection("orders").add(data).catch(function (err) {
      console.warn("Microzelen: could not save order to the admin dashboard", err);
    });
  }

  function saveClubSignupToCloud(name) {
    if (!window.MZ_DB) return;
    window.MZ_DB.collection("clubSignups").add({
      name: name,
      cityId: activeCityId,
      cityLabel: city().label || activeCityId,
      lang: document.documentElement.lang || "ru",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (err) {
      console.warn("Microzelen: could not save club signup to the admin dashboard", err);
    });
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

  // Shown instead of a toast for Telegram/Zalo: the toast lives on this page,
  // but the customer's attention jumps to the newly opened chat immediately,
  // so a fading notice here is easy to miss entirely. This modal blocks until
  // acknowledged, and only opens the chat once the customer clicks through it
  // — which also doubles as a fresh click for window.open, safe from popup
  // blockers.
  function handoffModalEl() {
    var el = document.getElementById("mz-handoff-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mz-handoff-modal";
    el.className = "mz-simple-modal";
    el.innerHTML =
      '<div class="mz-simple-modal-inner">' +
        '<button type="button" class="mz-simple-modal-close" data-handoff-close>×</button>' +
        '<p data-handoff-text></p>' +
        '<button type="button" id="mz-handoff-btn" class="mz-map-btn" style="width:100%;"></button>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function openHandoffModal(message, url, buttonLabel) {
    var el = handoffModalEl();
    el.querySelector("[data-handoff-text]").textContent = message;
    var btn = document.getElementById("mz-handoff-btn");
    btn.textContent = buttonLabel;
    btn.onclick = function () {
      window.open(url, "_blank");
      el.classList.remove("open");
    };
    el.classList.add("open");
  }

  function submitOrder() {
    if (cartCount() === 0) {
      toast(t.empty || "Cart is empty");
      return;
    }
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

    saveOrderToCloud(address, text);

    if (m.type === "whatsapp") {
      window.open("https://wa.me/" + m.number + "?text=" + encodeURIComponent(text), "_blank");
    } else if (m.type === "telegram") {
      // Telegram has no prefill-text deep link for a regular chat/channel.
      // Copy while this page still has focus (opening the chat first would
      // steal focus and silently break clipboard access), then show a modal
      // the customer has to click through — that click is what actually
      // opens the chat, so it's a fresh user gesture and won't be popup-blocked.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
      openHandoffModal(
        t.telegramCopied || "Order text copied. Tap below to open Telegram, then paste it (press and hold the message box).",
        "https://t.me/" + m.username,
        t.openTelegram || "Open Telegram"
      );
    } else if (m.type === "zalo") {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
      openHandoffModal(
        t.zaloCopied || "Order text copied. Tap below to open Zalo, then paste it (press and hold the message box).",
        "https://zalo.me/" + m.number,
        t.openZalo || "Open Zalo"
      );
    }
  }

  function submitClubSignup() {
    var nameInput = document.getElementById("mz-club-name");
    var name = nameInput ? nameInput.value.trim() : "";
    if (!name) {
      if (nameInput) nameInput.focus();
      toast(t.clubNameRequired || "Please enter your name");
      return;
    }
    var wa = cityMessengers().filter(function (m) { return m.type === "whatsapp"; })[0];
    if (!wa) return;
    saveClubSignupToCloud(name);
    var lines = [
      "💳 Хочу клубную карту Microzelen (10 ₾, разово)",
      "Имя: " + name
    ];
    window.open("https://wa.me/" + wa.number + "?text=" + encodeURIComponent(lines.join("\n")), "_blank");
  }

  document.addEventListener("click", function (e) {
    var cardToggle = e.target.closest("[data-card-toggle]");
    if (cardToggle) {
      var card = cardToggle.closest(".card");
      if (card) {
        var isOpen = card.classList.toggle("open");
        cardToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }
      return;
    }
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
    if (e.target.closest("[data-handoff-close]")) {
      document.getElementById("mz-handoff-modal").classList.remove("open");
      return;
    }
    if (e.target.id === "mz-handoff-modal") {
      e.target.classList.remove("open");
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
    var addWeightBtn = e.target.closest("[data-add-weight]");
    if (addWeightBtn) {
      var wid = addWeightBtn.getAttribute("data-add-weight");
      var input = document.querySelector('[data-weight-for="' + wid + '"]');
      var grams = input ? parseInt(input.value, 10) : 0;
      if (!grams) grams = productById(wid) ? productById(wid).minGrams || 100 : 100;
      setWeight(wid, grams);
      return;
    }
    var qtyBtn = e.target.closest(".mz-qty-btn");
    if (qtyBtn) {
      var id = qtyBtn.getAttribute("data-id");
      var action = qtyBtn.getAttribute("data-action");
      if (action === "inc") addItem(id);
      else if (action === "dec") removeItem(id);
      else if (action === "inc-weight") adjustWeight(id, 1);
      else if (action === "dec-weight") adjustWeight(id, -1);
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
    if (e.target.closest("#mz-club-signup-btn")) {
      submitClubSignup();
      return;
    }
    var copyBtn = e.target.closest(".mz-copy-iban");
    if (copyBtn) {
      // Only the account number goes on the clipboard: it's the one field a
      // banking app actually accepts pasted text into. Bank, holder and
      // amount are already shown as plain text right next to this button.
      var text = copyBtn.getAttribute("data-iban") || "";
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = t.copied || "Copied";
        setTimeout(function () {
          copyBtn.textContent = original;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        done();
      }
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    setCity(pickInitialCity());
  });
})();
