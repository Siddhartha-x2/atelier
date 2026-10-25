// Navigation, API requests and forms. Shared visual helpers are in ui.js.
const view = document.querySelector("#view");
const homeTemplate = document.createElement("template");
homeTemplate.content.append(...Array.from(view.childNodes, (node) => node.cloneNode(true)));
const notice = document.querySelector("#notice");
const navigation = document.querySelector("#navigation");
const account = document.querySelector("#account");
const editor = document.querySelector("#editor");
const state = {
  user: null,
  sessionLoading: true,
  screen: "home",
  afterLogin: null,
  catalog: null,
  pending: false,
  galleryStatus: "all",
  gallerySearch: "",
  recordFilters: {},
  potteryGlaze: "g-05",
};
function handleForm(form, save) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    for (const name of ["price", "wallSize", "quantity"]) {
      if (Object.hasOwn(body, name)) body[name] = Number(body[name]);
    }
    action(() => save(body));
  });
}
async function updateRecord(path, body = {}) {
  const result = await api(path, "POST", body);
  await loadScreen();
  message(result.message);
}
function showCommission(kind, rows) {
  const wall = kind === "bookings";
  const policy =
    "Requested and confirmed dates are reserved. Cancel through the day three days before your booking, in Kolkata time.";
  const history = records(kind, rows);
  if (state.user.role === "studio") {
    view.replaceChildren(
      heading(
        wall ? "Wall bookings." : "Pottery requests.",
        wall ? policy : "Review the chosen forms, glazes and dates. Accept or decline requested pieces.",
        wall ? "Studio / Commissions" : "Studio / Clay",
      ),
      history,
    );
    return;
  }
  const intro = wall
    ? heading(
        "Your walls are a blank canvas.",
        "Start with a date, a wall and a little imagination. We’ll receive your request and confirm or decline it.",
        "02 / A commission for your space",
      )
    : heading(
        "Made by hand. Imagined by you.",
        "Choose a form, a glaze and a date. A small idea can become something you use every day.",
        "03 / A commission in clay",
      );
  const study = wall ? makeWallStudy() : clayObject("i-02", state.potteryGlaze);
  view.replaceChildren(
    el("div", { className: `service-intro ${wall ? "indigo-intro" : "clay-intro"} enter` },
      intro,
      el("div", { className: wall ? "service-wall-study" : "commission-clay" }, study),
    ),
    el("div", { className: "two-column" },
      el("section", { className: "panel commission-panel", id: wall ? "wall-request" : "pottery-request" },
        el("p", { className: "eyebrow" }, "The brief"),
        el("h2", {}, wall ? "Tell us about your wall." : "Shape your request."),
        wall ? bookingForm() : potteryForm(),
        wall ? el("p", { className: "hint policy-note" }, policy) : null,
      ),
      el("section", {},
        el("div", { className: "section-heading compact" },
          el("h2", {}, wall ? "Your wall requests" : "Your pottery requests"),
          el("span", { className: "handwritten" }, wall ? "In the making." : "Little things, made personal."),
        ),
        history,
      ),
    ),
  );
}
let noticeTimer;
function message(text, error = false) {
  window.clearTimeout(noticeTimer);
  if (text && !error) noticeTimer = window.setTimeout(() => message(""), 6000);
  notice.replaceChildren();
  notice.hidden = !text;
  notice.className = `notice${error ? " error" : ""}`;
  notice.setAttribute("role", error ? "alert" : "status");
  if (text)
    notice.append(
      el("span", {}, text),
      button("Dismiss", () => message(""), "notice-close"),
    );
  const viewerError = document.querySelector(".viewer-error");
  if (viewerError) viewerError.textContent = error ? text : "";
  const dialogError = editor.querySelector(".dialog-error");
  if (editor.open && dialogError) dialogError.textContent = error ? text : "";
}
async function api(url, method = "GET", body) {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "The request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
async function action(work) {
  if (state.pending) return;
  state.pending = true;
  message("");
  const active = document.activeElement;
  const trigger =
    active?.closest("form")?.querySelector('button[type="submit"]') || (active?.tagName === "BUTTON" ? active : null);
  const originalLabel = trigger?.textContent;
  if (trigger) {
    trigger.textContent = "Working…";
    trigger.classList.add("is-pending");
    trigger.setAttribute("aria-busy", "true");
  }
  document.querySelectorAll("button:not(#theme-toggle)").forEach((node) => {
    node.disabled = true;
  });
  try {
    await work();
  } catch (error) {
    if (error.status === 401 && state.user) {
      state.user = null;
      if (editor.open) editor.close();
      closeArtwork();
      beginLogin(false, state.screen);
    }
    message(error.message, true);
  } finally {
    state.pending = false;
    if (trigger?.isConnected) {
      trigger.textContent = originalLabel;
      trigger.classList.remove("is-pending");
      trigger.removeAttribute("aria-busy");
    }
    document.querySelectorAll("button:not(#theme-toggle)").forEach((node) => {
      node.disabled = false;
    });
  }
}
function beginLogin(signup = false, destination = null) {
  writeRoute("auth", false);
  state.afterLogin = destination;
  showAuth(signup);
}
function openScreen(screen, push = true) {
  if (state.pending || state.sessionLoading) return;
  screen = resolveScreen(screen);
  if (push) writeRoute(!state.user && !["home", "auth"].includes(screen) ? "auth" : screen, false);
  homeCleanup();
  closeArtwork();
  message("");
  if (screen === "auth") beginLogin();
  else if (screen === "home") showHome();
  else if (!state.user) beginLogin(false, screen);
  else {
    state.screen = screen;
    loadScreen();
  }
  document.querySelector("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function updateHeader() {
  writeRoute(state.screen, true);
  account.replaceChildren();
  navigation.replaceChildren();
  const studio = state.user?.role === "studio";
  document.body.dataset.screen = state.screen;
  document.body.classList.toggle("studio-view", studio && state.screen !== "home");
  const labels = {
    home: "The atelier",
    ...(studio ? { dashboard: "Studio overview" } : {}),
    gallery: studio ? "Manage paintings" : "The collection",
    ...(state.user ? { orders: studio ? "All orders" : "My orders" } : {}),
    bookings: studio ? "Wall bookings" : "Wall art",
    pottery: studio ? "Pottery requests" : "Pottery",
  };
  document.title = `${labels[state.screen] || "Welcome"} · Art Studio`;
  if (!state.user)
    account.append(
      button("Log in", () => beginLogin(false), "text-button"),
      button("Sign up", () => beginLogin(true), "small-button"),
    );
  else
    account.append(
      el("span", { className: "account-name" },
        state.user.name,
        el("small", {}, studio ? "Studio member" : "Your studio account"),
      ),
      button(
        "Log out",
        () =>
          action(async () => {
            await api("/auth/logout", "POST", {});
            state.user = null;
            state.catalog = null;
            state.afterLogin = null;
            state.recordFilters = {};
            showHome();
            message("You are logged out.");
          }),
        "text-button",
      ),
    );
  for (const [screen, label] of Object.entries(labels)) {
    const tab = button(label, () => openScreen(screen));
    if (screen === state.screen) tab.setAttribute("aria-current", "page");
    navigation.append(tab);
  }
  if (state.sessionLoading)
    document.querySelectorAll("#account button, #navigation button").forEach((node) => (node.disabled = true));
}
document.querySelector("#brand-home").addEventListener("click", () => openScreen("home"));
function purchasePainting(p) {
  return action(async () => {
    const order = await api("/orders", "POST", { paintingId: p.id });
    closeArtwork();
    await loadScreen();
    message(`Order #${order.id} placed for ${money(order.price)}. You’ll find it in My orders.`);
  });
}
function showAuth(signup = false) {
  homeCleanup();
  ++loadScreen.ticket;
  state.screen = "auth";
  view.removeAttribute("aria-busy");
  updateHeader();
  const form = el("form");
  if (signup)
    field(form, "Your name", "name", "text", {
      maxlength: 100,
      autocomplete: "name",
    });
  field(form, "Email address", "email", "email", {
    maxlength: 254,
    autocomplete: "email",
  });
  field(form, "Password", "password", "password", {
    minlength: 10,
    maxlength: 128,
    autocomplete: signup ? "new-password" : "current-password",
    hint: "Use 10–128 characters.",
  });
  submit(form, signup ? "Create customer account" : "Step inside");
  handleForm(form, async (body) => {
    state.user = await api(signup ? "/auth/signup" : "/auth/login", "POST", body);
    state.screen = resolveScreen(state.afterLogin || (state.user.role === "studio" ? "dashboard" : "gallery"));
    state.afterLogin = null;
    await loadScreen();
    if (state.user) message(`Welcome, ${state.user.name}.`);
  });
  const destination = {
    gallery: "the painting collection",
    bookings: "wall-painting requests",
    pottery: "custom pottery",
  }[state.afterLogin];
  view.replaceChildren(
    el("section", { className: "auth-layout enter" },
      el("div", { className: "auth-story" },
        el("p", { className: "eyebrow" }, "There’s a little artist in all of us."),
        el("h1", {}, "Make yourself ", el("em", {}, "at home.")),
        framedArtwork(startingCollection[0], "auth-art"),
        el("p", { className: "handwritten" }, "Good things begin with a little curiosity."),
      ),
      el("div", { className: "panel auth-panel" },
        el("p", { className: "eyebrow" }, "Your place in the studio"),
        el("div", { className: "switcher", "aria-label": "Account options" },
          button(
            "Log in",
            () => {
              message("");
              showAuth(false);
            },
            signup ? "secondary" : "",
          ),
          button(
            "Sign up",
            () => {
              message("");
              showAuth(true);
            },
            signup ? "" : "secondary",
          ),
        ),
        el("h2", {}, signup ? "A fresh beginning." : "Welcome back."),
        el("p", { className: "muted" },
          destination
            ? `Sign in to explore ${destination}.`
            : signup
              ? "Create a customer account to collect and commission."
              : "Your paintings, personal spaces and pottery requests await.",
        ),
        form,
        el("p", { className: "hint account-hint" },
          "Studio members sign in with their studio account. Sign up to collect and commission.",
        ),
      ),
    ),
  );
}
function errorState(error) {
  if (error.status === 401) {
    state.user = null;
    beginLogin(false, state.screen);
    message(error.message, true);
    return;
  }
  view.replaceChildren(
    emptyState(
      "A small pause in the studio.",
      error.message,
      button("Try again", () => loadScreen(), "secondary"),
    ),
  );
}
async function loadScreen() {
  if (state.screen === "home") {
    showHome();
    return;
  }
  updateHeader();
  view.replaceChildren(
    el("div", { className: "state loading-state", role: "status" },
      el("span", { className: "loading-mark", "aria-hidden": "true" }),
      el("p", {}, "Getting the studio ready…"),
    ),
  );
  view.setAttribute("aria-busy", "true");
  const screen = state.screen;
  const ticket = ++loadScreen.ticket;
  try {
    const catalogPromise = api("/catalog");
    if (screen === "dashboard") {
      const [catalog, orders, bookings, pottery, paintings] = await Promise.all([
        catalogPromise,
        api("/orders"),
        api("/bookings"),
        api("/pottery"),
        api("/paintings"),
      ]);
      if (ticket !== loadScreen.ticket) return;
      state.catalog = catalog;
      showDashboard({ orders, bookings, pottery, paintings });
    } else {
      const [catalog, rows] = await Promise.all([
        catalogPromise,
        api(`/${screen === "gallery" ? "paintings" : screen}`),
      ]);
      if (ticket !== loadScreen.ticket) return;
      state.catalog = catalog;
      if (screen === "gallery") showGallery(rows);
      if (screen === "orders") showOrders(rows);
      if (screen === "bookings") showBookings(rows);
      if (screen === "pottery") showPottery(rows);
    }
    if (state.pending)
      document.querySelectorAll("button:not(#theme-toggle)").forEach((node) => {
        node.disabled = true;
      });
  } catch (error) {
    if (ticket === loadScreen.ticket) errorState(error);
  } finally {
    if (ticket === loadScreen.ticket) view.removeAttribute("aria-busy");
  }
}
loadScreen.ticket = 0;
function showGallery(rows) {
  const studio = state.user.role === "studio";
  const results = el("div", { className: "gallery-grid" });
  const count = el("p", { className: "result-count", role: "status" });
  const search = el("input", {
    type: "search",
    placeholder: "Search title or artist",
    maxlength: 120,
    "aria-label": "Search paintings",
  });
  search.value = state.gallerySearch;
  const chips = el("div", {
    className: "filter-chips",
    "aria-label": "Painting availability",
  });
  function draw() {
    const query = state.gallerySearch.trim().toLowerCase();
    const filtered = rows.filter(
      (p) =>
        (state.galleryStatus === "all" || p.status === state.galleryStatus) &&
        `${p.title} ${p.artist}`.toLowerCase().includes(query),
    );
    count.textContent = `${filtered.length} of ${rows.length} works · Prices in INR`;
    [...chips.children].forEach((chip) =>
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === state.galleryStatus)),
    );
    results.replaceChildren(
      ...(filtered.length
        ? filtered.map(paintingCard)
        : [
            emptyState(
              rows.length ? "No works match just yet." : "A blank canvas, for now.",
              rows.length
                ? "Try another title, artist or availability filter."
                : "The studio hasn’t added any paintings yet.",
              rows.length
                ? button(
                    "Reset filters",
                    () => {
                      state.galleryStatus = "all";
                      state.gallerySearch = "";
                      search.value = "";
                      draw();
                    },
                    "secondary",
                  )
                : null,
            ),
          ]),
    );
  }
  for (const [value, label] of [
    ["all", "All works"],
    ["available", "Available"],
    ["sold", "Sold"],
  ]) {
    const chip = button(
      label,
      () => {
        state.galleryStatus = value;
        draw();
      },
      "filter-chip",
    );
    chip.dataset.filter = value;
    chips.append(chip);
  }
  search.addEventListener("input", () => {
    state.gallerySearch = search.value;
    draw();
  });
  const toolbar = el("div", { className: "gallery-toolbar" },
    chips,
    el("label", { className: "search-field" }, el("span", { className: "sr-only" }, "Search paintings"), search),
  );
  const top = el("div", { className: "page-heading" },
    heading(
      studio ? "The collection, in your care." : "Find a piece of yourself.",
      studio
        ? "Add new work, edit available originals and keep an eye on the collection."
        : "Spend a little time with the originals. Each work has its own story.",
      "01 / Paintings",
    ),
    studio
      ? arrowButton("Add painting", () => openPainting())
      : el("span", { className: "handwritten" }, "Look a little closer."),
  );
  view.replaceChildren(top, toolbar, count, results);
  draw();
}
function openEditor(title, form) {
  editor.replaceChildren(
    el("div", { className: "dialog-header" },
      el("div", {}, el("p", { className: "eyebrow" }, "At the workbench"), el("h2", { id: "editor-title" }, title)),
      button("Close", () => editor.close(), "text-button"),
    ),
    el("p", { className: "dialog-error", role: "alert" }),
    form,
  );
  editor.showModal();
}
function openPainting(p) {
  const form = el("form");
  field(form, "Title", "title", "text", { maxlength: 300 }).value = p?.title || "";
  field(form, "Artist", "artist", "text", { maxlength: 100 }).value = p?.artist || "";
  field(form, "Description", "description", "textarea", {
    maxlength: 3000,
  }).value = p?.description || "";
  field(form, "Price (₹)", "price", "number", {
    min: 0.01,
    max: 10000000,
    step: 0.01,
  }).value = p?.price || "";
  selectField(
    form,
    "Supplied image",
    "imageUrl",
    state.catalog.images.map((url, i) => ({
      id: url,
      name: `Image ${i + 1} (${url.split("/").pop()})`,
    })),
    p?.imageUrl,
  );
  submit(form, p ? "Save painting" : "Add painting");
  handleForm(form, async (body) => {
    await api(p ? `/paintings/${p.id}` : "/paintings", p ? "PUT" : "POST", body);
    editor.close();
    await loadScreen();
    message(p ? "Painting saved." : "Painting added to the collection.");
  });
  openEditor(p ? "Edit available painting" : "Add an original", form);
}
function cancelButton(kind, row, label) {
  return button(label, () => action(() => updateRecord(`/${kind}/${row.id}/cancel`)), "danger");
}
function decisionButtons(kind, row, statuses) {
  const labels = { confirmed: "Confirm", accepted: "Accept", declined: "Decline" };
  return statuses.map((status) =>
    button(
      labels[status],
      () => action(() => updateRecord(`/${kind}/${row.id}/decision`, { status })),
      status === "declined" ? "danger" : "",
    ),
  );
}
function filteredRecords(kind, rows, render, emptyText, statuses) {
  const filters = (state.recordFilters[kind] ||= { query: "", status: "all" });
  const results = el("div", { className: "record-results" });
  const count = el("p", { className: "result-count", role: "status" });
  const search = el("input", {
    type: "search",
    placeholder: state.user.role === "studio" ? "Search requests or customers" : "Search your records",
    maxlength: 120,
  });
  search.value = filters.query;
  const select = el("select", {},
    el("option", { value: "all" }, "All statuses"),
    statuses.map((status) => el("option", { value: status }, capitalize(status))),
  );
  select.value = filters.status;
  const bar = el("div", { className: "record-filters" },
    el("label", {}, "Search", search),
    el("label", {}, "Status", select),
  );
  function draw() {
    const query = filters.query.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (filters.status === "all" || row.status === filters.status) &&
        Object.values(row).join(" ").toLowerCase().includes(query),
    );
    count.textContent = `${filtered.length} ${filtered.length === 1 ? "record" : "records"}`;
    results.replaceChildren(
      filtered.length
        ? render(filtered)
        : emptyState(
            rows.length ? "Nothing matches this view." : "A little space for what comes next.",
            rows.length ? "Try a different search or status." : emptyText,
            rows.length
              ? button(
                  "Reset filters",
                  () => {
                    filters.query = "";
                    filters.status = "all";
                    search.value = "";
                    select.value = "all";
                    draw();
                  },
                  "secondary",
                )
              : null,
          ),
    );
  }
  search.addEventListener("input", () => {
    filters.query = search.value;
    draw();
  });
  select.addEventListener("change", () => {
    filters.status = select.value;
    draw();
  });
  draw();
  return el("div", { className: "records-section" }, bar, count, results);
}
function showOrders(rows) {
  const studio = state.user.role === "studio";
  view.replaceChildren(
    heading(
      studio ? "Every original, accounted for." : "The pieces you picked.",
      "Placed orders can be cancelled, returning the painting to the collection.",
      studio ? "Studio / Orders" : "Your studio / Orders",
    ),
    records("orders", rows),
  );
}
function bookingForm() {
  const form = el("form");
  field(form, "Your preferred date", "date", "date", {
    min: addDays(state.catalog.today, 7),
    max: addDays(state.catalog.today, 90),
    hint: "Choose 7–90 calendar days from today, in Kolkata time.",
  });
  const size = field(form, "Wall size (square feet)", "wallSize", "number", {
    min: 10,
    max: 500,
    step: "any",
    hint: "Between 10 and 500 sq ft. Fractional sizes are welcome.",
  });
  field(form, "Full address", "address", "textarea", {
    maxlength: 1000,
    autocomplete: "street-address",
    hint: "Where would you like the studio to paint?",
  });
  const quote = el("strong", {}, "Add your wall size");
  form.append(
    el("div", { className: "form-quote" },
      el("span", {}, "Your wall, estimated"),
      quote,
      el("small", {}, `${money(state.catalog.wallRate)} per sq ft · Your total is confirmed when you request.`),
    ),
  );
  size.addEventListener("input", () => {
    quote.textContent =
      size.value && Number.isFinite(Number(size.value)) && Number(size.value) > 0
        ? money(Number(size.value) * state.catalog.wallRate)
        : "Add your wall size";
  });
  submit(form, "Request wall painting");
  handleForm(form, async (body) => {
    const row = await api("/bookings", "POST", body);
    await loadScreen();
    message(`Booking #${row.id} requested for ${money(row.total)}.`);
  });
  return form;
}
function showBookings(rows) {
  showCommission("bookings", rows);
}
function potteryForm(row) {
  const form = el("form");
  const item = selectField(form, "Choose a form", "itemId", state.catalog.items, row?.itemId);
  const glaze = selectField(
    form,
    "Choose a glaze",
    "glazeId",
    state.catalog.glazes,
    row?.glazeId || state.potteryGlaze,
  );
  const quantity = field(form, "How many?", "quantity", "number", {
    min: 1,
    max: 12,
    step: 1,
    hint: "From 1 to 12 pieces, in whole numbers.",
  });
  quantity.value = row?.quantity || 1;
  const needed = field(form, "Needed by", "neededBy", "date", {
    min: addDays(state.catalog.today, 14),
    hint: "Allow at least 14 calendar days. There is no 90-day maximum.",
  });
  needed.value = row?.neededBy || "";
  const summary = el("strong");
  const clayPreview = el("div", { className: "request-clay-preview" });
  form.prepend(clayPreview);
  function updateSummary() {
    clayPreview.replaceChildren(
      clayObject(item.value, glaze.value),
      el("p", { className: "hint" }, "Your form & glaze · illustrative preview"),
    );
    summary.textContent = `${quantity.value || "—"} × ${item.selectedOptions[0]?.textContent || "Choose an item"} · ${glaze.selectedOptions[0]?.textContent || "Choose a glaze"}`;
  }
  [item, glaze, quantity].forEach((input) => input.addEventListener("input", updateSummary));
  glaze.addEventListener("input", () => {
    state.potteryGlaze = glaze.value;
    const largePreview = view.querySelector(".commission-clay");
    if (largePreview) largePreview.replaceChildren(clayObject("i-02", glaze.value));
  });
  updateSummary();
  form.append(
    el("div", { className: "form-quote clay-quote" },
      el("span", {}, "Your pottery brief"),
      summary,
      el("small", {}, "You can edit or cancel while the request is still requested."),
    ),
  );
  submit(form, row ? "Save request" : "Request pottery");
  handleForm(form, async (body) => {
    await api(row ? `/pottery/${row.id}` : "/pottery", row ? "PUT" : "POST", body);
    if (row) editor.close();
    await loadScreen();
    message(row ? "Pottery request updated." : "Your pottery request is with the studio.");
  });
  return form;
}
function showPottery(rows) {
  showCommission("pottery", rows);
}
function showDashboard(data) {
  const walls = data.bookings.filter((row) => row.status === "requested");
  const pottery = data.pottery.filter((row) => row.status === "requested");
  const metrics = [
    [data.paintings.filter((row) => row.status === "available").length, "Available paintings", "gallery"],
    [walls.length, "Wall requests to review", "bookings"],
    [pottery.length, "Pottery requests to review", "pottery"],
    [data.orders.filter((row) => row.status === "placed").length, "Placed orders", "orders"],
  ];
  view.replaceChildren(
    heading(
      "Behind the art.",
      "A calm place to look after the collection and the work in progress.",
      "Studio / Overview",
    ),
    el("div", { className: "dashboard-metrics" },
      metrics.map(([count, label, screen]) => {
        const metric = button("", () => openScreen(screen), "metric");
        metric.append(el("strong", {}, count), el("span", {}, label), el("small", {}, "Open view ↗"));
        return metric;
      }),
    ),
    dashboardSection("bookings", walls),
    dashboardSection("pottery", pottery),
  );
}
const routeNames = new Set(["home", "auth", "gallery", "orders", "bookings", "pottery", "dashboard"]);
function readRoute() {
  const name = location.hash.replace(/^#\/?/, "");
  return name === "collection" ? "gallery" : routeNames.has(name) ? name : "home";
}
function resolveScreen(screen) {
  return screen === "dashboard" && state.user && state.user.role !== "studio" ? "gallery" : screen;
}
function writeRoute(screen, replace = false) {
  const hash = screen === "home" ? "" : `#${screen}`;
  if (location.hash !== hash)
    history[replace ? "replaceState" : "pushState"](null, "", location.pathname + location.search + hash);
}
function onHistory() {
  if (state.sessionLoading) return;
  if (state.pending) {
    writeRoute(state.screen, true);
    return;
  }
  const page = readRoute();
  if (page !== state.screen) openScreen(page, false);
}
window.addEventListener("popstate", onHistory);
window.addEventListener("hashchange", onHistory);
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  const main = document.querySelector("#main");
  main.focus();
  main.scrollIntoView({ behavior: "instant" });
});
document
  .querySelectorAll("footer [data-page]")
  .forEach((node) => node.addEventListener("click", () => openScreen(node.dataset.page)));
async function start() {
  const requested = readRoute();
  const anchor = ["#personal-services", "#main"].includes(location.hash) ? location.hash.slice(1) : null;
  state.sessionLoading = true;
  updateHeader();
  try {
    state.user = await api("/auth/me");
  } catch (error) {
    state.user = null;
    if (error.status !== 401) {
      state.sessionLoading = false;
      showHome();
      message(error.message, true);
      notice.append(button("Retry session", start, "notice-close"));
      return;
    }
  }
  state.sessionLoading = false;
  if (requested === "home") showHome();
  else if (requested === "auth") showAuth();
  else openScreen(requested, false);
  if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "instant" }));
}
start();
