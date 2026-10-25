/* Plain browser JavaScript. API routes and request bodies match the existing backend. */
const view = document.querySelector("#view");
// Preserve a pristine copy of the authored HTML for returning to the homepage.
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
function heading(title, detail, eyebrow = "From the atelier") {
  return el("div", { className: "intro" },
    el("p", { className: "eyebrow" }, eyebrow),
    el("h1", {}, title),
    el("p", { className: "muted" }, detail),
  );
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
// Public editorial captions identify the supplied art, without claiming live inventory.
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
// Illustration paths are authored here; no server or user text is inserted as HTML.
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
function purchasePainting(p) {
  return action(async () => {
    const order = await api("/orders", "POST", { paintingId: p.id });
    closeArtwork();
    await loadScreen();
    message(`Order #${order.id} placed for ${money(order.price)}. You’ll find it in My orders.`);
  });
}
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    action(async () => {
      state.user = await api(signup ? "/auth/signup" : "/auth/login", "POST", body);
      state.screen = state.afterLogin || (state.user.role === "studio" ? "dashboard" : "gallery");
      state.screen = resolveScreen(state.screen);
      state.afterLogin = null;
      await loadScreen();
      if (state.user) message(`Welcome, ${state.user.name}.`);
    });
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
function emptyState(title, detail, recovery) {
  return el("div", { className: "state empty-state" },
    el("span", { className: "state-mark", "aria-hidden": "true" }, "✳"),
    el("h3", {}, title),
    el("p", {}, detail),
    recovery,
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.price = Number(body.price);
    action(async () => {
      await api(p ? `/paintings/${p.id}` : "/paintings", p ? "PUT" : "POST", body);
      editor.close();
      await loadScreen();
      message(p ? "Painting saved." : "Painting added to the collection.");
    });
  });
  openEditor(p ? "Edit available painting" : "Add an original", form);
}
function cancelButton(kind, row, label) {
  return button(
    label,
    () =>
      action(async () => {
        const result = await api(`/${kind}/${row.id}/cancel`, "POST", {});
        await loadScreen();
        message(result.message);
      }),
    "danger",
  );
}
function decisionButtons(kind, row, statuses) {
  const labels = {
    confirmed: "Confirm",
    declined: "Decline",
    accepted: "Accept",
  };
  return statuses.map((status) =>
    button(
      labels[status],
      () =>
        action(async () => {
          const result = await api(`/${kind}/${row.id}/decision`, "POST", {
            status,
          });
          await loadScreen();
          message(result.message);
        }),
      status === "declined" ? "danger" : "",
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
function customerName(row) {
  return el("div", {},
    el("strong", {}, row.customerName),
    el("small", { className: "cell-detail" }, row.customerEmail),
  );
}
function showOrders(rows) {
  const studio = state.user.role === "studio";
  const render = (filtered) =>
    studio
      ? recordTable(
          filtered,
          [
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
          ],
          "All painting orders",
        )
      : el("div", { className: "records-list" },
          filtered.map((row) =>
            el("article", { className: "record order-record" },
              el("img", {
                src: row.imageUrl,
                alt: row.title,
                className: "order-thumbnail",
                loading: "lazy",
              }),
              el("div", { className: "record-content" },
                el("div", { className: "work-meta" }, el("span", {}, `ORDER / ${row.id}`), badge(row.status)),
                el("h3", {}, row.title),
                el("p", { className: "record-detail" }, `Placed ${dateTime(row.createdAt)} (Kolkata)`),
                el("p", { className: "price" }, money(row.price)),
              ),
              row.status === "placed"
                ? el("div", { className: "actions" }, cancelButton("orders", row, "Cancel order"))
                : null,
            ),
          ),
        );
  view.replaceChildren(
    heading(
      studio ? "Every original, accounted for." : "The pieces you picked.",
      "Placed orders can be cancelled, returning the painting to the collection.",
      studio ? "Studio / Orders" : "Your studio / Orders",
    ),
    filteredRecords("orders", rows, render, "Your painting orders will appear here after you buy an available work.", [
      "placed",
      "cancelled",
    ]),
  );
}
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.wallSize = Number(body.wallSize);
    action(async () => {
      const row = await api("/bookings", "POST", body);
      await loadScreen();
      message(`Booking #${row.id} requested for ${money(row.total)}.`);
    });
  });
  return form;
}
function bookingRecords(rows, studio) {
  return filteredRecords(
    "bookings",
    rows,
    (filtered) =>
      studio
        ? recordTable(
            filtered,
            [
              ["Booking", (row) => `#${row.id} · ${row.date}`],
              ["Customer", customerName],
              [
                "Wall & address",
                (row) =>
                  el("div", {},
                    `${row.wallSize} sq ft · ${money(row.total)}`,
                    el("small", { className: "cell-detail" }, row.address),
                  ),
              ],
              ["Status", (row) => badge(row.status)],
              [
                "Decision",
                (row) =>
                  row.status === "requested"
                    ? el("div", { className: "actions" }, decisionButtons("bookings", row, ["confirmed", "declined"]))
                    : "No action needed",
              ],
            ],
            "Wall-painting bookings",
          )
        : el("div", { className: "records-list" },
            filtered.map((row) => {
              const eligible = ["requested", "confirmed"].includes(row.status);
              return el("article", { className: "record" },
                el("div", { className: "work-meta" }, el("span", {}, `WALL / ${row.id}`), badge(row.status)),
                el("h3", {}, row.date),
                el("p", { className: "record-detail" }, row.address),
                el("p", { className: "record-detail" }, `${row.wallSize} sq ft × ${money(row.rate)}/sq ft`),
                el("p", { className: "price" }, money(row.total)),
                eligible
                  ? el("p", { className: "hint" },
                      `Cancellation deadline: ${addDays(row.date, -3)}, 11:59:59 PM Kolkata time.`,
                    )
                  : null,
                eligible && state.catalog.today <= addDays(row.date, -3)
                  ? el("div", { className: "actions" }, cancelButton("bookings", row, "Cancel booking"))
                  : null,
              );
            }),
          ),
    "Your wall-painting requests and studio decisions will appear here.",
    ["requested", "confirmed", "declined", "cancelled"],
  );
}
function showBookings(rows) {
  const studio = state.user.role === "studio";
  const policy =
    "Requested and confirmed dates are reserved. Cancel through the day three days before your booking, in Kolkata time.";
  const history = bookingRecords(rows, studio);
  if (studio) {
    view.replaceChildren(heading("Wall bookings.", policy, "Studio / Commissions"), history);
    return;
  }
  view.replaceChildren(
    el("div", { className: "service-intro indigo-intro enter" },
      heading(
        "Your walls are a blank canvas.",
        "Start with a date, a wall and a little imagination. We’ll receive your request and confirm or decline it.",
        "02 / A commission for your space",
      ),
      el("div", { className: "service-wall-study" }, makeWallStudy()),
    ),
    el("div", { className: "two-column" },
      el("section", { className: "panel commission-panel", id: "wall-request" },
        el("p", { className: "eyebrow" }, "The brief"),
        el("h2", {}, "Tell us about your wall."),
        bookingForm(),
        el("p", { className: "hint policy-note" }, policy),
      ),
      el("section", {},
        el("div", { className: "section-heading compact" },
          el("h2", {}, "Your wall requests"),
          el("span", { className: "handwritten" }, "In the making."),
        ),
        history,
      ),
    ),
  );
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
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.quantity = Number(body.quantity);
    action(async () => {
      await api(row ? `/pottery/${row.id}` : "/pottery", row ? "PUT" : "POST", body);
      if (row) editor.close();
      await loadScreen();
      message(row ? "Pottery request updated." : "Your pottery request is with the studio.");
    });
  });
  return form;
}
function potteryRecords(rows, studio) {
  return filteredRecords(
    "pottery",
    rows,
    (filtered) =>
      studio
        ? recordTable(
            filtered,
            [
              ["Request", (row) => `#${row.id} · ${row.item}`],
              ["Customer", customerName],
              [
                "Details",
                (row) =>
                  el("div", {},
                    `${row.quantity} × ${row.glaze}`,
                    el("small", { className: "cell-detail" }, `Needed by ${row.neededBy}`),
                  ),
              ],
              ["Status", (row) => badge(row.status)],
              [
                "Decision",
                (row) =>
                  row.status === "requested"
                    ? el("div", { className: "actions" }, decisionButtons("pottery", row, ["accepted", "declined"]))
                    : "No action needed",
              ],
            ],
            "Custom pottery requests",
          )
        : el("div", { className: "records-list" },
            filtered.map((row) =>
              el("article", { className: "record" },
                el("div", { className: "work-meta" }, el("span", {}, `CLAY / ${row.id}`), badge(row.status)),
                el("h3", {}, row.item),
                el("p", { className: "record-detail" }, `${row.glaze} · Quantity ${row.quantity}`),
                el("p", { className: "record-detail" }, `Needed by ${row.neededBy}`),
                row.status === "requested"
                  ? el("div", { className: "actions" },
                      button(
                        "Edit request",
                        () => openEditor("Refine your pottery request", potteryForm(row)),
                        "secondary",
                      ),
                      cancelButton("pottery", row, "Cancel request"),
                    )
                  : null,
              ),
            ),
          ),
    "Your custom pottery requests will appear here.",
    ["requested", "accepted", "declined", "cancelled"],
  );
}
function showPottery(rows) {
  const studio = state.user.role === "studio";
  const history = potteryRecords(rows, studio);
  if (studio) {
    view.replaceChildren(
      heading(
        "Pottery requests.",
        "Review the chosen forms, glazes and dates. Accept or decline requested pieces.",
        "Studio / Clay",
      ),
      history,
    );
    return;
  }
  view.replaceChildren(
    el("div", { className: "service-intro clay-intro enter" },
      heading(
        "Made by hand. Imagined by you.",
        "Choose a form, a glaze and a date. A small idea can become something you use every day.",
        "03 / A commission in clay",
      ),
      el("div", { className: "commission-clay" }, clayObject("i-02", state.potteryGlaze)),
    ),
    el("div", { className: "two-column" },
      el("section", { className: "panel commission-panel", id: "pottery-request" },
        el("p", { className: "eyebrow" }, "The brief"),
        el("h2", {}, "Shape your request."),
        potteryForm(),
      ),
      el("section", {},
        el("div", { className: "section-heading compact" },
          el("h2", {}, "Your pottery requests"),
          el("span", { className: "handwritten" }, "Little things, made personal."),
        ),
        history,
      ),
    ),
  );
}
function showDashboard(data) {
  const requestedWalls = data.bookings.filter((row) => row.status === "requested");
  const requestedPottery = data.pottery.filter((row) => row.status === "requested");
  const metrics = [
    [data.paintings.filter((row) => row.status === "available").length, "Available paintings", "gallery"],
    [requestedWalls.length, "Wall requests to review", "bookings"],
    [requestedPottery.length, "Pottery requests to review", "pottery"],
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
    el("section", { className: "dashboard-section" },
      el("div", { className: "section-heading compact" },
        el("h2", {}, "Wall requests to review"),
        arrowButton("All wall bookings", () => openScreen("bookings"), "text-button"),
      ),
      requestedWalls.length
        ? recordTable(
            requestedWalls,
            [
              ["Date", (row) => row.date],
              ["Customer", customerName],
              ["Wall", (row) => `${row.wallSize} sq ft · ${money(row.total)}`],
              [
                "Decision",
                (row) =>
                  el("div", { className: "actions" }, decisionButtons("bookings", row, ["confirmed", "declined"])),
              ],
            ],
            "Requested wall bookings",
          )
        : emptyState("The wall workbench is clear.", "No wall requests are waiting for a decision."),
    ),
    el("section", { className: "dashboard-section" },
      el("div", { className: "section-heading compact" },
        el("h2", {}, "Pottery requests to review"),
        arrowButton("All pottery requests", () => openScreen("pottery"), "text-button"),
      ),
      requestedPottery.length
        ? recordTable(
            requestedPottery,
            [
              ["Item", (row) => row.item],
              ["Customer", customerName],
              ["Needed by", (row) => row.neededBy],
              [
                "Decision",
                (row) => el("div", { className: "actions" }, decisionButtons("pottery", row, ["accepted", "declined"])),
              ],
            ],
            "Requested pottery",
          )
        : emptyState("The clay workbench is clear.", "No pottery requests are waiting for a decision."),
    ),
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
