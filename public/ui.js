// Shared HTML rendering, artwork previews and animations. Loaded before app.js.
const recordInfo = {
  orders: {
    label: "ORDER",
    caption: "All painting orders",
    statuses: ["placed", "cancelled"],
    empty: "Your painting orders will appear here after you buy an available work.",
  },
  bookings: {
    label: "WALL",
    caption: "Wall-painting bookings",
    decisions: ["confirmed", "declined"],
    statuses: ["requested", "confirmed", "declined", "cancelled"],
    empty: "Your wall-painting requests and studio decisions will appear here.",
  },
  pottery: {
    label: "CLAY",
    caption: "Custom pottery requests",
    decisions: ["accepted", "declined"],
    statuses: ["requested", "accepted", "declined", "cancelled"],
    empty: "Your custom pottery requests will appear here.",
  },
};
function actionButtons(...buttons) {
  return el("div", { className: "actions" }, ...buttons);
}
function recordActions(kind, row) {
  if (kind === "orders") return row.status === "placed" ? actionButtons(cancelButton(kind, row, "Cancel order")) : null;
  if (kind === "bookings") {
    return ["requested", "confirmed"].includes(row.status) && state.catalog.today <= addDays(row.date, -3)
      ? actionButtons(cancelButton(kind, row, "Cancel booking"))
      : null;
  }
  return row.status === "requested"
    ? actionButtons(
        button("Edit request", () => openEditor("Refine your pottery request", potteryForm(row)), "secondary"),
        cancelButton(kind, row, "Cancel request"),
      )
    : null;
}
function recordCard(kind, row) {
  const order = kind === "orders",
    wall = kind === "bookings";
  const details = order
    ? [`Placed ${dateTime(row.createdAt)} (Kolkata)`]
    : wall
      ? [row.address, `${row.wallSize} sq ft × ${money(row.rate)}/sq ft`]
      : [`${row.glaze} · Quantity ${row.quantity}`, `Needed by ${row.neededBy}`];
  const content = [
    el("div", { className: "work-meta" }, el("span", {}, `${recordInfo[kind].label} / ${row.id}`), badge(row.status)),
    el("h3", {}, order ? row.title : wall ? row.date : row.item),
    ...details.map((text) => el("p", { className: "record-detail" }, text)),
    order || wall ? el("p", { className: "price" }, money(order ? row.price : row.total)) : null,
    wall && ["requested", "confirmed"].includes(row.status)
      ? el("p", { className: "hint" }, `Cancellation deadline: ${addDays(row.date, -3)}, 11:59:59 PM Kolkata time.`)
      : null,
  ];
  return order
    ? el("article", { className: "record order-record" },
        el("img", { src: row.imageUrl, alt: row.title, className: "order-thumbnail", loading: "lazy" }),
        el("div", { className: "record-content" }, ...content),
        recordActions(kind, row),
      )
    : el("article", { className: "record" }, ...content, recordActions(kind, row));
}
function decisionCell(kind, row) {
  return row.status === "requested"
    ? actionButtons(decisionButtons(kind, row, recordInfo[kind].decisions))
    : "No action needed";
}
function recordColumns(kind) {
  if (kind === "orders")
    return [
      [
        "Order",
        (row) =>
          el("div", {},
            `#${row.id} · ${row.title}`,
            el("small", { className: "cell-detail" }, dateTime(row.createdAt)),
          ),
      ],
      ["Customer", customerName],
      ["Price", (row) => money(row.price)],
      ["Status", (row) => badge(row.status)],
      ["Management", () => "Customer-managed"],
    ];
  const wall = kind === "bookings";
  return [
    [wall ? "Booking" : "Request", (row) => `#${row.id} · ${wall ? row.date : row.item}`],
    ["Customer", customerName],
    [
      wall ? "Wall & address" : "Details",
      (row) =>
        el("div", {},
          wall ? `${row.wallSize} sq ft · ${money(row.total)}` : `${row.quantity} × ${row.glaze}`,
          el("small", { className: "cell-detail" }, wall ? row.address : `Needed by ${row.neededBy}`),
        ),
    ],
    ["Status", (row) => badge(row.status)],
    ["Decision", (row) => decisionCell(kind, row)],
  ];
}
function records(kind, rows) {
  const info = recordInfo[kind];
  return filteredRecords(
    kind,
    rows,
    (filtered) =>
      state.user.role === "studio"
        ? recordTable(filtered, recordColumns(kind), info.caption)
        : el("div", { className: "records-list" },
            filtered.map((row) => recordCard(kind, row)),
          ),
    info.empty,
    info.statuses,
  );
}
function dashboardSection(kind, rows) {
  const wall = kind === "bookings";
  return el("section", { className: "dashboard-section" },
    el("div", { className: "section-heading compact" },
      el("h2", {}, wall ? "Wall requests to review" : "Pottery requests to review"),
      arrowButton(wall ? "All wall bookings" : "All pottery requests", () => openScreen(kind), "text-button"),
    ),
    rows.length
      ? recordTable(
          rows,
          [
            [wall ? "Date" : "Item", (row) => (wall ? row.date : row.item)],
            ["Customer", customerName],
            [
              wall ? "Wall" : "Needed by",
              (row) => (wall ? `${row.wallSize} sq ft · ${money(row.total)}` : row.neededBy),
            ],
            ["Decision", (row) => decisionCell(kind, row)],
          ],
          wall ? "Requested wall bookings" : "Requested pottery",
        )
      : emptyState(
          wall ? "The wall workbench is clear." : "The clay workbench is clear.",
          wall ? "No wall requests are waiting for a decision." : "No pottery requests are waiting for a decision.",
        ),
  );
}
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
const dateTime = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
const capitalize = (value) => value[0].toUpperCase() + value.slice(1);
let fieldCount = 0;
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined)
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const button = (label, onClick, className = "") => el("button", { type: "button", className, onClick }, label);
const badge = (status) => el("span", { className: `badge ${status}` }, status);
const arrowButton = (label, onClick, className = "") => button(`${label} ↗`, onClick, className);
function heading(title, detail, eyebrow = "From the atelier") {
  return el("div", { className: "intro" },
    el("p", { className: "eyebrow" }, eyebrow),
    el("h1", {}, title),
    el("p", { className: "muted" }, detail),
  );
}
const startingCollection = [
  {
    image: "/images/p-001.jpg",
    title: "Madhubani Peacock Garden",
    artist: "Meera Kumari",
  },
  {
    image: "/images/p-003.jpg",
    title: "Tanjore Lakshmi with Gold Leaf",
    artist: "Revathi Iyer",
  },
  {
    image: "/images/p-005.jpg",
    title: "Kalamkari Tree of Life",
    artist: "Padma Reddy",
  },
];
function framedArtwork(work, className = "") {
  return el("figure", { className: `framed-work ${className}` },
    el("div", { className: "frame-picture" },
      el("img", {
        src: work.image,
        alt: work.title,
        loading: className.includes("hero") ? "eager" : "lazy",
      }),
    ),
    el("figcaption", {}, el("span", {}, work.title), el("small", {}, work.artist)),
  );
}
function makeWallStudy() {
  const n = ++fieldCount;
  const id = `wall-reveal-${n}`;
  const range = el("input", {
    id,
    type: "range",
    min: "0",
    max: "100",
    value: "62",
    "aria-label": "Reveal the painted wall",
    "aria-describedby": `wall-description-${n}`,
    "aria-valuetext": "62 percent painted wall revealed",
  });
  const after = el("div", { className: "room-after" },
    el("img", {
      src: "/illustrations/room-painted.svg",
      alt: "",
      draggable: "false",
      loading: "lazy",
    }),
  );
  const divider = el("div", { className: "room-divider", "aria-hidden": "true" }, el("span", {}, "↔"));
  const room = el(
    "div",
    {
      className: "room-comparison",
      role: "group",
      "aria-label": "Illustrated wall before and after painting",
    },
    el("img", {
      src: "/illustrations/room-plain.svg",
      alt: "Illustrated reading corner with a plain plaster wall, chair, lamp and clay vase",
      draggable: "false",
      loading: "lazy",
    }),
    after,
    divider,
    el("span", { className: "room-label room-label-before" }, "Before"),
    el("span", { className: "room-label room-label-after" }, "After"),
    range,
  );
  const output = el("output", { for: id }, "62% revealed");
  function update() {
    const value = Number(range.value);
    after.style.clipPath = `inset(0 0 0 ${100 - value}%)`;
    divider.style.left = `${100 - value}%`;
    range.setAttribute("aria-valuetext", `${value} percent painted wall revealed`);
    output.value = `${value}% revealed`;
  }
  range.addEventListener("input", update);
  update();
  return el("figure", { className: "wall-study" },
    room,
    el("figcaption", {}, el("label", { for: id }, "Drag to make a little room for colour"), output),
    el("p", { className: "study-note", id: `wall-description-${n}` },
      "Before: a plain plaster wall. After: pigment blue, a vermilion arch and a saffron sun. An illustrated possibility for your space.",
    ),
  );
}
function clayObject(shape = "i-02", glaze = "g-05") {
  const drawings = {
    "i-01":
      '<path d="M105 110h150l-17 140q-58 24-116 0Z"/><ellipse cx="180" cy="110" rx="75" ry="15" class="clay-mouth"/><path d="M128 145q48 14 104 0m-100 30q48 13 96 0m-92 30q44 12 88 0" class="clay-lines"/>',
    "i-02":
      '<path d="M158 54h44l-3 68c0 23 66 46 65 97-1 52-37 69-84 69s-83-17-84-69c-1-51 65-74 65-97Z"/><path d="M201 139c83-38 104 86 49 89" fill="none" stroke="currentColor" stroke-width="18"/><ellipse cx="180" cy="54" rx="22" ry="6" class="clay-mouth"/><path d="M108 217q72 28 144 0m-139 21q67 22 133 0" class="clay-lines"/>',
    "i-03":
      '<path d="M143 83h74l-6 27c4 22 66 37 67 100 2 58-45 80-98 80s-100-22-98-80c1-63 63-78 67-100Z"/><ellipse cx="180" cy="83" rx="37" ry="9" class="clay-mouth"/><path d="M94 190q86 30 172 0m-168 24q82 30 164 0" class="clay-lines"/>',
    "i-04":
      '<path d="M54 194q51-35 104 0-10 57-52 57t-52-57Z"/><path d="M181 194q57-45 122-1-14 58-61 58t-61-57Z"/><path d="M111 183q-16-25 4-47 13 28-4 47m136 0q-16-25 4-47 13 28-4 47" class="clay-flame"/>',
    "i-05":
      '<path d="M90 111h180l-28 159q-62 20-124 0Z"/><path d="M83 108h194v28H83Z"/><ellipse cx="180" cy="108" rx="97" ry="19" class="clay-mouth"/><path d="M122 171q58 19 116 0m-109 38q51 15 102 0" class="clay-lines"/>',
  };
  const wrapper = el("div", {
    className: `clay-object glaze-${glaze}`,
    "data-shape": shape,
    "aria-hidden": "true",
  });
  wrapper.innerHTML = `<svg viewBox="0 0 360 330" xmlns="http://www.w3.org/2000/svg"><ellipse cx="182" cy="294" rx="103" ry="11" class="clay-shadow"/><g class="clay-form">${drawings[shape] || drawings["i-02"]}</g></svg>`;
  return wrapper;
}
const glazeStudies = [
  ["g-01", "Kumkum Red"],
  ["g-02", "Haldi Yellow"],
  ["g-03", "Mehendi Green"],
  ["g-04", "Indigo Blue"],
  ["g-05", "Sandalwood Beige"],
  ["g-06", "Charcoal Black"],
];
let homeCleanup = () => {};
function showHome() {
  homeCleanup();
  const ticket = ++loadScreen.ticket;
  state.screen = "home";
  view.removeAttribute("aria-busy");
  updateHeader();
  view.replaceChildren(homeTemplate.content.cloneNode(true));
  view
    .querySelectorAll("[data-page]")
    .forEach((node) => node.addEventListener("click", () => openScreen(node.dataset.page)));
  view.querySelectorAll("[data-artwork]").forEach((node) =>
    node.addEventListener("click", () => {
      const work = startingCollection[Number(node.dataset.artwork)];
      openArtwork({
        title: work.title,
        artist: work.artist,
        imageUrl: work.image,
        description: "From the Art Studio collection. Open the collection for current prices and availability.",
      });
    }),
  );
  view.querySelector(".commission-link").addEventListener("click", (event) => {
    event.preventDefault();
    view.querySelector("#personal-services").scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  });
  const range = view.querySelector("#home-wall-reveal");
  range.addEventListener("input", () => {
    const value = Number(range.value);
    view.querySelector(".room-after").style.clipPath = `inset(0 0 0 ${100 - value}%)`;
    view.querySelector(".room-divider").style.left = `${100 - value}%`;
    range.setAttribute("aria-valuetext", `${value} percent painted wall revealed`);
    view.querySelector(".wall-study output").value = `${value}% revealed`;
  });
  function updateGlaze(id) {
    state.potteryGlaze = id;
    view.querySelector(".clay-display .clay-object").className = `clay-object glaze-${id}`;
    view
      .querySelectorAll("[data-glaze]")
      .forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.glaze === id)));
    view.querySelector(".glaze-name").textContent =
      glazeStudies.find(([value]) => value === id)?.[1] || "Sandalwood Beige";
  }
  view
    .querySelectorAll("[data-glaze]")
    .forEach((node) => node.addEventListener("click", () => updateGlaze(node.dataset.glaze)));
  updateGlaze(state.potteryGlaze);
  const depthCleanup = setupStageDepth(view.querySelector(".artwork-stage"));
  const motionCleanup = setupSectionMotion(view);
  homeCleanup = () => {
    depthCleanup();
    motionCleanup();
  };
  async function loadHomeCollection() {
    if (!state.user || ticket !== loadScreen.ticket) return;
    const collection = view.querySelector("[data-home-collection]");
    const note = view.querySelector("[data-home-inventory-note]");
    collection.className = "gallery-grid home-live-gallery";
    collection.setAttribute("aria-busy", "true");
    collection.replaceChildren(
      el("p", { className: "state loading-state", role: "status" }, "Loading current paintings…"),
    );
    note.textContent = "Checking current prices and availability.";
    try {
      const rows = await api("/paintings");
      if (ticket !== loadScreen.ticket || !state.user) return;
      collection.replaceChildren(
        ...(rows.length
          ? rows.slice(0, 3).map(paintingCard)
          : [emptyState("The collection is taking shape.", "The studio hasn’t added any paintings yet.")]),
      );
      note.textContent = "Explore the full collection for every original and current availability.";
    } catch (error) {
      if (ticket !== loadScreen.ticket) return;
      const expired = error.status === 401;
      if (expired) {
        state.user = null;
        updateHeader();
      }
      collection.replaceChildren(
        emptyState(
          expired ? "Please sign in again." : "We couldn’t load the collection.",
          error.message,
          button(
            expired ? "Sign in" : "Retry collection",
            expired ? () => beginLogin(false, "home") : loadHomeCollection,
            "secondary",
          ),
        ),
      );
      note.textContent = "Live prices and availability are currently unavailable.";
    } finally {
      collection.removeAttribute("aria-busy");
    }
  }
  if (state.user) loadHomeCollection();
}
function setupSectionMotion(scope) {
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (media?.matches || !window.IntersectionObserver) return () => {};
  const animations = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!media?.matches && entry.target.animate) {
          const animation = entry.target.animate([{ transform: "translateY(24px)" }, { transform: "translateY(0)" }], {
            duration: 850,
            easing: "cubic-bezier(.2,.7,.2,1)",
          });
          animations.add(animation);
          animation.finished.then(() => animations.delete(animation)).catch(() => {});
        }
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08 },
  );
  scope.querySelectorAll("[data-entrance]").forEach((node) => observer.observe(node));
  const stop = () => {
    observer.disconnect();
    animations.forEach((animation) => animation.cancel());
    animations.clear();
  };
  media?.addEventListener?.("change", stop);
  return () => {
    stop();
    media?.removeEventListener?.("change", stop);
  };
}
function setupStageDepth(stage) {
  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  let frame;
  const reset = () => {
    stage.style.setProperty("--depth-x", "0px");
    stage.style.setProperty("--depth-y", "0px");
  };
  const move = (event) => {
    if (motion?.matches || !fine?.matches || event.pointerType === "touch") return;
    window.cancelAnimationFrame?.(frame);
    frame = requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      stage.style.setProperty("--depth-x", `${((event.clientX - rect.left) / rect.width - 0.5) * 12}px`);
      stage.style.setProperty("--depth-y", `${((event.clientY - rect.top) / rect.height - 0.5) * 9}px`);
    });
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerleave", reset);
  motion?.addEventListener?.("change", reset);
  return () => {
    window.cancelAnimationFrame?.(frame);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerleave", reset);
    motion?.removeEventListener?.("change", reset);
  };
}
const artworkViewer = document.querySelector("#artwork-viewer");
let artworkReturnFocus;
function closeArtwork() {
  if (artworkViewer.open) artworkViewer.close();
}
artworkViewer.addEventListener("close", () => {
  document.body.classList.remove("viewer-open");
  if (artworkReturnFocus?.isConnected) artworkReturnFocus.focus();
  else document.querySelector("#main").focus({ preventScroll: true });
});
artworkViewer.addEventListener("click", (event) => {
  if (event.target === artworkViewer) closeArtwork();
});
artworkViewer.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    if (!state.pending) closeArtwork();
  }
  if (event.key !== "Tab") return;
  const nodes = [...artworkViewer.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
  const first = nodes[0],
    last = nodes.at(-1);
  if (!first) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && (document.activeElement === first || !artworkViewer.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
artworkViewer.addEventListener("cancel", (event) => {
  if (state.pending) event.preventDefault();
});
function openArtwork(p) {
  if (state.pending) return;
  artworkReturnFocus = document.activeElement;
  const knownInventory = !!p.id && !!p.status;
  const studio = state.user?.role === "studio";
  const controls = el("div", { className: "viewer-actions" });
  if (!knownInventory)
    controls.append(
      arrowButton("See price & availability", () => {
        closeArtwork();
        openScreen("gallery");
      }),
    );
  else if (p.status === "available")
    controls.append(
      studio
        ? button("Edit painting", () => {
            closeArtwork();
            openPainting(p);
          })
        : button("Buy painting", () => purchasePainting(p)),
    );
  else controls.append(el("p", { className: "unavailable-note" }, "This original is currently unavailable."));
  const close = button("Close ×", closeArtwork, "viewer-close secondary");
  artworkViewer.replaceChildren(
    el("div", { className: "viewer-top" }, el("span", {}, "ART STUDIO / A CLOSER LOOK"), close),
    el("div", { className: "viewer-layout" },
      el("div", { className: "viewer-stage" }, el("img", { src: p.imageUrl, alt: p.title })),
      el("div", { className: "viewer-details" },
        el("p", { className: "eyebrow" }, knownInventory ? `Original / ${p.id}` : "From the collection"),
        el("h2", { id: "artwork-title" }, p.title),
        el("p", { className: "viewer-artist" }, p.artist),
        el("p", { className: "viewer-description" }, p.description),
        knownInventory
          ? el("div", { className: "viewer-price" }, el("strong", {}, money(p.price)), badge(p.status))
          : null,
        el("p", { className: "viewer-error dialog-error", role: "alert" }),
        controls,
        el("p", { className: "hint" },
          knownInventory
            ? "Your order uses the current price and availability."
            : "Sign in to see the live collection.",
        ),
      ),
    ),
  );
  document.body.classList.add("viewer-open");
  artworkViewer.showModal();
  close.focus();
}
function field(form, label, name, type = "text", options = {}) {
  const { hint, ...attributes } = options;
  const id = `field-${++fieldCount}`;
  const input = el(type === "textarea" ? "textarea" : "input", {
    id,
    name,
    ...(type === "textarea" ? {} : { type }),
    required: "",
    ...attributes,
  });
  const wrapper = el("div", { className: "field" }, el("label", { for: id }, label), input);
  if (hint) {
    input.setAttribute("aria-describedby", `${id}-hint`);
    wrapper.append(el("small", { className: "hint", id: `${id}-hint` }, hint));
  }
  form.append(wrapper);
  return input;
}
function selectField(form, label, name, choices, value) {
  const id = `field-${++fieldCount}`;
  const select = el("select", { name, id, required: "" },
    choices.map((choice) => el("option", { value: choice.id }, choice.name)),
  );
  if (value) select.value = value;
  form.append(el("div", { className: "field" }, el("label", { for: id }, label), select));
  return select;
}
function submit(form, label) {
  form.append(el("button", { type: "submit" }, label));
}
function emptyState(title, detail, recovery) {
  return el("div", { className: "state empty-state" },
    el("span", { className: "state-mark", "aria-hidden": "true" }, "✳"),
    el("h3", {}, title),
    el("p", {}, detail),
    recovery,
  );
}
function paintingCard(p, index) {
  const studio = state.user.role === "studio";
  const bottom = el("div", { className: "card-bottom" }, el("span", { className: "price" }, money(p.price)));
  if (p.status === "available")
    bottom.append(
      studio
        ? button("Edit painting", () => openPainting(p), "secondary")
        : button("Buy painting", () => purchasePainting(p)),
    );
  else bottom.append(el("span", { className: "unavailable-note" }, "Currently unavailable"));
  return el(
    "article",
    {
      className: `card painting-card enter${index === 0 || index === 7 ? " featured" : ""}${p.status === "sold" ? " is-sold" : ""}`,
    },
    el("div", { className: "painting-mount" },
      el("img", {
        src: p.imageUrl,
        alt: p.title,
        className: "painting-image",
        loading: "lazy",
      }),
      (() => {
        const look = button("View artwork ↗", () => openArtwork(p), "artwork-open");
        look.setAttribute("aria-label", `View artwork: ${p.title}`);
        return look;
      })(),
    ),
    el("div", { className: "card-body" },
      el("div", { className: "work-meta" },
        el("span", {}, `WORK / ${p.id.startsWith("p-0") ? p.id.slice(2) : "STUDIO"}`),
        badge(p.status),
      ),
      el("h2", {}, p.title),
      el("p", { className: "artist" }, p.artist),
      el("details", { className: "art-notes" }, el("summary", {}, "About this work"), el("p", {}, p.description)),
      bottom,
    ),
  );
}
function recordTable(rows, columns, caption) {
  return el("div", { className: "table-wrap", tabindex: "0", role: "region", "aria-label": caption },
    el("table", {},
      el("caption", { className: "sr-only" }, caption),
      el("thead", {},
        el("tr", {},
          columns.map(([label]) => el("th", { scope: "col" }, label)),
        ),
      ),
      el("tbody", {},
        rows.map((row) =>
          el("tr", {},
            columns.map(([, content]) => el("td", {}, content(row))),
          ),
        ),
      ),
    ),
  );
}
function customerName(row) {
  return el("div", {},
    el("strong", {}, row.customerName),
    el("small", { className: "cell-detail" }, row.customerEmail),
  );
}
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
