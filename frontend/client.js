// made by tejas singh
const socket = io(location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");

const i = id => document.getElementById(id);
const v = id => i(id).value;

let currentUser = "";
let typingTimeout;
let currentChat = { type: "group", friend: null };
const typingUsers = new Set();

// Decode a *small allowlist* of HTML entities so users see normal symbols.
// Then ALWAYS render with textContent (NOT innerHTML).
function decodeForDisplay(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")  // matches your server's &#039;
    .replace(/&amp;/g, "&");
}

// ---------------- DOM-SAFE LIST UPDATES ----------------
function setFriendsList(friends) {
  const list = i("friends-dm-list");
  if (!list) return;
  list.innerHTML = "";
  friends.forEach(f => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = `💬 ${f}`;
    btn.className = "dm-btn";
    btn.dataset.user = f;
    btn.addEventListener("click", () => openDM(f));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function setFriendRequestsList(requests) {
  const list = i("friend-requests");
  if (!list) return;
  list.innerHTML = "";
  requests.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r + " ";
    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "✅";
    acceptBtn.addEventListener("click", () => acceptFriend(r));
    const declineBtn = document.createElement("button");
    declineBtn.textContent = "❌";
    declineBtn.addEventListener("click", () => declineFriend(r));
    li.appendChild(acceptBtn);
    li.appendChild(declineBtn);
    list.appendChild(li);
  });
}

function setOnlineUsers(users) {
  const list = i("online-users");
  if (!list) return; // ✅ prevents null crash

  list.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u;
    if (u === currentUser) {
      li.classList.add("current-user"); // use CSS instead of inline style
    }
    list.appendChild(li);
  });
}

// ---------------- EVENT HANDLERS ----------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(div => div.classList.remove("active"));
  const el = i(id);
  if (el) el.classList.add("active");
}

// Swap to HTTP signup/login that sets HttpOnly cookie OR fallback to socket methods
async function signup() {
  const u = v("signup-username"), p = v("signup-password"), c = v("signup-confirm-password");
  if (p !== c) return alert("Passwords don’t match!");
  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    });
    if (res.ok) {
      currentUser = u;
      showScreen("chat-screen");
      // After HTTP signup, try token login from cookie
      const token = getCookie("token");
      if (token) socket.emit("token login", token);
      socket.emit("get sidebar");
    } else {
      const json = await res.json().catch(() => ({}));
      alert("❌ " + (json.error || "Signup failed"));
    }
  } catch (e) {
    // fallback to socket signup if HTTP fails
    socket.emit("sign up", { username: u, password: p });
  }
}

async function signIn() {
  const username = v("signin-username"), password = v("signin-password");
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      currentUser = username;
      showScreen("chat-screen");
      const token = getCookie("token");
      if (token) socket.emit("token login", token);
      socket.emit("get sidebar");
    } else {
      const json = await res.json().catch(() => ({}));
      alert("❌ " + (json.error || "Login failed"));
      i("signin-password").value = "";
    }
  } catch (e) {
    // fallback to socket sign in if HTTP fails
    socket.emit("sign in", { username, password });
  }
}

// ---------------- CHAT HANDLERS ----------------
function addMessage(msg) {
  const sender = msg.username || msg.from;
  const mine = sender === currentUser;

  const li = document.createElement("li");
  if (msg._id) li.id = msg._id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // meta row (user, time, ticks)
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${sender} • ${msg.time || ""}`;

  // ticks span (only show for own messages)
  if (mine) {
    const ticks = document.createElement("span");
    ticks.className = "ticks";
    ticks.textContent = (msg.seenBy?.length) ? "✓✓" : (msg.deliveredTo?.length ? "✓✓" : "✓");
    if (msg.seenBy?.length) ticks.classList.add("blue");
    meta.appendChild(ticks);
  }

  // main text
  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.textContent = decodeForDisplay(msg.text);

  bubble.appendChild(meta);
  bubble.appendChild(textDiv);

  // reactions container
  const reactionsDiv = document.createElement("div");
  reactionsDiv.className = "reactions";
  if (msg.reactions) {
    // msg.reactions might be Map or object
    let entries;
    if (msg.reactions instanceof Map) entries = Array.from(msg.reactions.entries());
    else if (typeof msg.reactions === "object") entries = Object.entries(msg.reactions);
    else entries = [];

    for (const [emoji, users] of entries) {
      const span = document.createElement("span");
      span.textContent = `${emoji} ${users.length}`;
      span.addEventListener("click", () => {
        socket.emit(users.includes(currentUser) ? "remove reaction" : "add reaction", { msgId: msg._id, emoji });
      });
      reactionsDiv.appendChild(span);
    }
  }
  bubble.appendChild(reactionsDiv);

  // seen-by list (names)
  const seenDiv = document.createElement("div");
  seenDiv.className = "seen-by";
  if (msg.seenBy?.length) seenDiv.textContent = "Seen by: " + msg.seenBy.join(", ");
  bubble.appendChild(seenDiv);

  // emit "message seen" if it’s not your own
  if (!mine && (currentChat.type === "group" || currentChat.type === "dm")) {
    if (msg._id) socket.emit("message seen", msg._id);
  }

  // edit/delete for own messages
  if (mine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => {
      li.remove();
      if (currentChat.type === "group") {
        socket.emit("delete message", msg._id);
      } else if (currentChat.type === "dm") {
        socket.emit("delete dm", { to: currentChat.friend, id: msg._id });
      }
    });

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => {
      const current = decodeForDisplay(msg.text);
      const text = prompt("Edit:", current);
      if (!text?.trim()) return;
      textDiv.textContent = decodeForDisplay(text);
      msg.text = text;
      if (currentChat.type === "group") {
        socket.emit("edit message", { id: msg._id, newText: text });
      } else if (currentChat.type === "dm") {
        socket.emit("edit dm", { to: currentChat.friend, id: msg._id, newText: text });
      }
    });

    bubble.appendChild(deleteBtn);
    bubble.appendChild(editBtn);
  }

  li.appendChild(bubble);
  const container = i("messages");
  if (container) container.appendChild(li);
  // scroll to bottom
  if (container) container.scrollTop = container.scrollHeight;
}

function deleteMessage(id) { socket.emit("delete message", id); }
function editMessage(id, old) {
  const text = prompt("Edit:", old);
  if (text?.trim()) socket.emit("edit message", { id, newText: text });
}

function highlightDM(friend) {
  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.add("new-message");
}

function sendMessage() {
  const text = v("message");
  if (!text.trim()) return;

  if (currentChat.type === "group") {
    socket.emit("chat message", { username: currentUser, text });
  } else {
    const msg = {
      from: currentUser,
      to: currentChat.friend,
      text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString()
    };
    addMessage(msg);
    socket.emit("direct message", { to: currentChat.friend, text });
  }
  const input = i("message");
  if (input) input.value = "";
  socket.emit("stop typing");
}

function sendFriendRequest() { const u = prompt("Enter username:"); if (u) socket.emit("send friend request", u); }
function acceptFriend(u) { socket.emit("accept friend request", u); }
function declineFriend(u) { socket.emit("decline friend request", u); }

function openGroupChat() {
  currentChat = { type: "group", friend: null };
  const title = i("chat-title");
  if (title) title.textContent = "🌍 Group Chat";
  const container = i("messages");
  if (container) container.innerHTML = "";
  socket.emit("get group messages");
}

function openDM(friend) {
  currentChat = { type: "dm", friend, loaded: false };
  const title = i("chat-title");
  if (title) title.textContent = "💬 DM with " + friend;
  const container = i("messages");
  if (container) container.innerHTML = "";

  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.remove("new-message");

  socket.emit("get direct messages", friend);
}

// ---------------- TYPING INDICATOR ----------------
const messageInput = i("message");
if (messageInput) {
  messageInput.addEventListener("input", () => {
    socket.emit("typing");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop typing"), 1000);
  });
}

socket.on("typing", (username) => {
  if (username !== currentUser) typingUsers.add(username);
  updateTypingIndicator();
});

socket.on("stop typing", (username) => {
  typingUsers.delete(username);
  updateTypingIndicator();
});

function updateTypingIndicator() {
  const indicator = i("typing-indicator");
  if (!indicator) return;
  const users = [...typingUsers];

  if (users.length === 0) indicator.textContent = "";
  else if (users.length === 1) indicator.textContent = `${users[0]} is typing...`;
  else if (users.length === 2) indicator.textContent = `${users[0]} and ${users[1]} are typing...`;
  else if (users.length === 3) indicator.textContent = `${users[0]}, ${users[1]} and ${users[2]} are typing...`;
  else indicator.textContent = "Many people are typing...";
}

// ---------------- SOCKET EVENTS ----------------
socket.on("sign in success", u => { currentUser = u; showScreen("chat-screen"); socket.emit("get sidebar"); });
socket.on("sign up success", (username) => {
  currentUser = username;
  showScreen("chat-screen"); // directly go to chat
});
socket.on("sign in error", err => { alert("❌ " + err); const p = i("signin-password"); if (p) p.value = ""; });
socket.on("sign up error", err => { alert("❌ " + err); const p = i("signup-password"); if (p) p.value = ""; const c = i("signup-confirm-password"); if (c) c.value = ""; });

socket.on("sidebar data", ({ friends, friendRequests }) => {
  setFriendsList(friends || []);
  setFriendRequestsList(friendRequests || []);
});

socket.on("sidebar update", (user) => { if (user === currentUser) socket.emit("get sidebar"); });

socket.on("previous messages", msgs => { const container = i("messages"); if(container){ container.innerHTML = ""; (msgs||[]).forEach(addMessage); } });
socket.on("chat message", addMessage);
socket.on("direct messages", ({ friend, msgs }) => {
  if (currentChat.type === "dm" && currentChat.friend === friend) { const container = i("messages"); if(container){ container.innerHTML = ""; (msgs||[]).forEach(addMessage); currentChat.loaded = true; } }
});
socket.on("direct message", msg => {
  if (currentChat.type === "dm" && (msg.from === currentChat.friend || msg.to === currentUser)) addMessage(msg);
  else if (msg.to === currentUser) highlightDM(msg.from);
});
socket.on("message deleted", id => {
  const el = i(id);
  if (el) el.remove();
});
socket.on("message edited", msg => {
  const el = i(msg._id)?.querySelector(".text");
  if (el) el.textContent = decodeForDisplay(msg.text);
});
socket.on("online users", setOnlineUsers);

// reaction updated (kept)
socket.on("reaction updated", ({ msgId, reactions }) => {
  const msgEl = i(msgId);
  if (!msgEl) return;
  const reactionsDiv = msgEl.querySelector(".reactions");
  if (reactionsDiv) {
    reactionsDiv.innerHTML = "";
    let entries;
    if (reactions instanceof Map) entries = Array.from(reactions.entries());
    else entries = Object.entries(reactions || {});
    for (const [emoji, users] of entries) {
      const span = document.createElement("span");
      span.textContent = `${emoji} ${users.length}`;
      span.addEventListener("click", () => {
        socket.emit(users.includes(currentUser) ? "remove reaction" : "add reaction", { msgId, emoji });
      });
      reactionsDiv.appendChild(span);
    }
  }
});

// ====== UNIFIED delivered/seen updates ======
socket.on("delivered update", ({ msgId, username, type }) => {
  const msgEl = i(msgId);
  if (!msgEl) return;
  const ticks = msgEl.querySelector(".ticks");
  if (ticks) {
    ticks.textContent = "✓✓";
    ticks.classList.remove("sent");
    ticks.classList.add("delivered");
  }
});

socket.on("seen update", ({ msgId, username, type }) => {
  const msgEl = i(msgId);
  if (!msgEl) return;
  const ticks = msgEl.querySelector(".ticks");

  if (type === "dm") {
    if (ticks) {
      ticks.textContent = "✓✓";
      ticks.classList.remove("delivered");
      ticks.classList.add("seen");
    }
  } else if (type === "group") {
    const seenDiv = msgEl.querySelector(".seen-by");
    if (seenDiv && !seenDiv.textContent.includes(username)) {
      seenDiv.textContent = seenDiv.textContent
        ? seenDiv.textContent + ", " + username
        : "Seen by: " + username;
    }
    if (ticks) {
      ticks.textContent = "✓✓";
      ticks.classList.remove("sent");
      ticks.classList.add("delivered");
    }
  }
});

// ---------------- FORM + BUTTON HANDLERS ----------------
const signupBtn = i("signup-btn");
if (signupBtn) signupBtn.addEventListener("click", signup);

const signinBtn = i("signin-btn");
if (signinBtn) signinBtn.addEventListener("click", signIn);

const signupSwitchBtn = i("signup-switch-btn");
if (signupSwitchBtn) signupSwitchBtn.addEventListener("click", () => showScreen("signup-screen"));

const signinSwitchBtn = i("signin-switch-btn");
if (signinSwitchBtn) signinSwitchBtn.addEventListener("click", () => showScreen("signin-screen"));

const groupChatBtn = i("group-chat-btn");
if (groupChatBtn) groupChatBtn.addEventListener("click", openGroupChat);

const addFriendBtn = i("add-friend-btn");
if (addFriendBtn) addFriendBtn.addEventListener("click", sendFriendRequest);

const messageForm = i("message-form");
if (messageForm) messageForm.addEventListener("submit", e => { e.preventDefault(); sendMessage(); });

// cookie helper
function getCookie(name) {
  return document.cookie.split('; ').find(row => row.startsWith(name + '='))?.split('=')[1];
}

// auto-login if token cookie exists
const token = getCookie("token");
if (token) socket.emit("token login", token);

// handle set-cookie from socket fallback (still kept for compatibility)
// this is a best-effort fallback only; real secure cookie should be set via HTTP
socket.on("set-cookie", token => {
  try {
    const maxAge = 2 * 365 * 24 * 60 * 60; // 2 years in seconds
    document.cookie = `token=${token}; path=/; secure; samesite=strict; max-age=${maxAge}`;
  } catch (e) {
    console.warn("Could not set cookie from socket", e);
  }
});
// ---------------- LOGOUT ----------------
function logout() {
  document.cookie = "token=; path=/; max-age=0"; // clear JWT cookie
  location.reload(); // log out
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", logout);
}

// ---------------- PUSH TOKEN registration helper (if you use FCM in frontend) ----------------
async function registerPushToken(username, fcmToken) {
  try {
    await fetch("/api/register-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, fcmToken })
    });
  } catch (e) {
    console.warn("Failed to register push token", e);
  }
}

// ✅ Export the logout function and helpers (kept)
export {
  logout,
  signup, signIn, sendMessage, showScreen,
  addMessage, deleteMessage, editMessage,
  sendFriendRequest, acceptFriend, declineFriend,
  openGroupChat, openDM, getCookie
};