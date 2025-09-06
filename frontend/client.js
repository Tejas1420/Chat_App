// frontend/client.js
const socket = io(location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");

const i = id => document.getElementById(id);
const v = id => i(id).value;

let currentUser = "";
let typingTimeout;
let currentChat = { type: "group", groupId: null, friend: null, loaded: false };
const typingUsers = new Set();
let replyTo = null;
let uploadingFiles = [];

function decodeForDisplay(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
}

// ---------------- UI helpers ----------------
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
    li.appendChild(acceptBtn); li.appendChild(declineBtn);
    list.appendChild(li);
  });
}

function setGroupsList(groups) {
  const el = i("group-list");
  if (!el) return;
  el.innerHTML = "";
  groups.forEach(g => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = `# ${g.name}`;
    btn.addEventListener("click", () => openGroup(g._id, g.name));
    li.appendChild(btn);
    el.appendChild(li);
  });
}

function setOnlineUsers(users) {
  const list = i("online-users");
  if (!list) return;
  list.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.textContent = u;
    if (u === currentUser) li.classList.add("current-user");
    list.appendChild(li);
  });
}

// ---------------- screens ----------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(div => div.classList.remove("active"));
  const el = i(id); if (el) el.classList.add("active");
}

// auth
async function signup() {
  const u = v("signup-username"), p = v("signup-password"), c = v("signup-confirm-password");
  if (p !== c) return alert("Passwords don’t match!");
  try {
    const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
    if (res.ok) {
      currentUser = u; showScreen("chat-screen");
      const token = getCookie("token"); if (token) socket.emit("token login", token);
      socket.emit("get sidebar"); socket.emit("get groups");
    } else { const json = await res.json().catch(()=>({})); alert("❌ " + (json.error || "Signup failed")); }
  } catch (e) { socket.emit("sign up", { username: u, password: p }); }
}

async function signIn() {
  const username = v("signin-username"), password = v("signin-password");
  try {
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (res.ok) {
      currentUser = username; showScreen("chat-screen");
      const token = getCookie("token"); if (token) socket.emit("token login", token);
      socket.emit("get sidebar"); socket.emit("get groups");
    } else { const json = await res.json().catch(()=>({})); alert("❌ " + (json.error || "Login failed")); i("signin-password").value = ""; }
  } catch (e) { socket.emit("sign in", { username, password }); }
}

// ---------------- Message rendering ----------------
function addMessage(msg) {
  // Determine sender
  const sender = msg.username || msg.from;
  const mine = sender === currentUser;

  const li = document.createElement("li");
  if (msg._id) li.id = msg._id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${sender} • ${msg.time || ""}`;

  if (mine) {
    const ticks = document.createElement("span");
    ticks.className = "ticks";
    ticks.textContent = (msg.seenBy?.length) ? "✓✓" : (msg.deliveredTo?.length ? "✓✓" : "✓");
    if (msg.seenBy?.length) ticks.classList.add("blue");
    meta.appendChild(ticks);
  }

  const textDiv = document.createElement("div");
  textDiv.className = "text";

  // reply preview
  if (msg.replyTo?.text) {
    const q = document.createElement("div");
    q.className = "reply-preview";
    q.textContent = `${msg.replyTo.username || msg.replyTo.from || ""}: ${decodeForDisplay(msg.replyTo.text || "")}`;
    bubble.appendChild(q);
  }

  textDiv.textContent = decodeForDisplay(msg.text);
  bubble.appendChild(meta); bubble.appendChild(textDiv);

  // attachments
  if (msg.attachments?.length) {
    const att = document.createElement("div");
    att.className = "attachments";
    msg.attachments.forEach(a => {
      const aEl = document.createElement("a");
      aEl.href = a.url; aEl.target = "_blank";
      aEl.textContent = a.name || a.url;
      att.appendChild(aEl);
    });
    bubble.appendChild(att);
  }

  // reactions
  const reactionsDiv = document.createElement("div");
  reactionsDiv.className = "reactions";
  if (msg.reactions) {
    let entries;
    if (msg.reactions instanceof Map) entries = Array.from(msg.reactions.entries());
    else entries = Object.entries(msg.reactions || {});
    for (const [emoji, users] of entries) {
      const span = document.createElement("span");
      span.textContent = `${emoji} ${users.length}`;
      span.addEventListener("click", () => socket.emit(users.includes(currentUser) ? "remove reaction" : "add reaction", { msgId: msg._id, emoji }));
      reactionsDiv.appendChild(span);
    }
  }
  bubble.appendChild(reactionsDiv);

  // seen-by
  const seenDiv = document.createElement("div");
  seenDiv.className = "seen-by";
  if (msg.seenBy?.length) seenDiv.textContent = "Seen by: " + msg.seenBy.join(", ");
  bubble.appendChild(seenDiv);

  // actions for own messages
  if (mine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️"; deleteBtn.addEventListener("click", () => { li.remove(); if (currentChat.type === "group") socket.emit("delete message", msg._id); else if (currentChat.type === "dm") socket.emit("delete dm", { to: currentChat.friend, id: msg._id }); });
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️"; editBtn.addEventListener("click", () => {
      const current = decodeForDisplay(msg.text);
      const text = prompt("Edit:", current);
      if (!text?.trim()) return;
      textDiv.textContent = decodeForDisplay(text);
      msg.text = text;
      if (currentChat.type === "group") socket.emit("edit message", { id: msg._id, newText: text });
      else socket.emit("edit dm", { to: currentChat.friend, id: msg._id, newText: text });
    });
    bubble.appendChild(deleteBtn); bubble.appendChild(editBtn);
  } else {
    // reply button for others' messages
    const replyBtn = document.createElement("button");
    replyBtn.textContent = "↩️ Reply";
    replyBtn.addEventListener("click", () => {
      replyTo = msg;
      const ra = i("reply-area");
      ra.style.display = "block";
      ra.textContent = `Replying to ${msg.username || msg.from}: ${decodeForDisplay((msg.text||"").slice(0,120))}`;
    });
    bubble.appendChild(replyBtn);
  }

  li.appendChild(bubble);
  const container = i("messages");
  if (container) container.appendChild(li);
  if (container) container.scrollTop = container.scrollHeight;
}

function highlightDM(friend) {
  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.add("new-message");
}

function deleteMessage(id) { socket.emit("delete message", id); }
function editMessage(id, old) {
  const text = prompt("Edit:", old);
  if (text?.trim()) socket.emit("edit message", { id, newText: text });
}

// ---------------- sending ----------------
async function sendMessage() {
  const text = v("message");
  if (!text.trim() && uploadingFiles.length === 0) return;

  // attachments already uploaded and stored in uploadingFiles
  const attachments = uploadingFiles.slice(); // copy
  uploadingFiles = [];

  if (currentChat.type === "group") {
    socket.emit("chat message", { username: currentUser, text, groupId: currentChat.groupId, replyTo: replyTo?._id, attachments });
  } else {
    const msg = { from: currentUser, to: currentChat.friend, text, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), attachments };
    addMessage(msg);
    socket.emit("direct message", { to: currentChat.friend, text, attachments, replyTo: replyTo?._id });
  }
  i("message").value = "";
  replyTo = null;
  i("reply-area").style.display = "none";
  socket.emit("stop typing");
}

// file upload helper
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (json?.url) {
      uploadingFiles.push({ url: json.url, name: json.name, mime: json.mime });
    }
  } catch (err) {
    console.warn("upload error", err);
  }
}

// create group
async function createGroup() {
  const name = prompt("Group name:");
  if (!name) return;
  const desc = prompt("Description (optional):");
  try {
    const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: desc }) });
    const group = await res.json();
    socket.emit("get groups");
    alert("Group created: " + group.name);
  } catch (e) { alert("Group creation failed"); }
}

// open group
async function openGroup(groupId, name) {
  currentChat = { type: "group", groupId };
  i("chat-title").textContent = `# ${name}`;
  const container = i("messages"); container.innerHTML = "";
  socket.emit("join group", groupId);
  socket.emit("get groups");
  // load latest messages paginated
  const res = await fetch(`/api/groups/${groupId}/messages?limit=50`);
  const msgs = await res.json();
  msgs.forEach(addMessage);
  currentChat.loaded = true;

  // attach infinite scroll loader
  container._loading = false;
  container._firstMsgId = msgs[0]?._id || null;
  container.addEventListener("scroll", async function scroller() {
    if (container.scrollTop === 0 && !container._loading) {
      container._loading = true;
      const firstId = container._firstMsgId;
      if (!firstId) { container._loading = false; return; }
      const res = await fetch(`/api/groups/${groupId}/messages?before=${firstId}&limit=25`);
      const older = await res.json();
      if (older.length === 0) { container._loading = false; return; }
      container._firstMsgId = older[0]._id;
      // prepend older messages and keep scroll position
      const oldHeight = container.scrollHeight;
      older.reverse().forEach(m => {
        const li = document.createElement("li");
        li.id = m._id;
        li.innerHTML = `<div class="bubble"><div class="meta">${m.username} • ${m.time}</div><div class="text">${decodeForDisplay(m.text)}</div></div>`;
        container.insertBefore(li, container.firstChild);
      });
      const newHeight = container.scrollHeight;
      container.scrollTop = newHeight - oldHeight;
      container._loading = false;
    }
  }, { passive: true });
}

// open DM
function openDM(friend) {
  currentChat = { type: "dm", friend, loaded: false };
  i("chat-title").textContent = "💬 DM with " + friend;
  const container = i("messages"); container.innerHTML = "";
  // load DM history via HTTP
  fetch(`/api/dm/${friend}?limit=50`).then(r => r.json()).then(msgs => { msgs.forEach(addMessage); currentChat.loaded = true; });
  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.remove("new-message");
  // tell server to add this socket to DM room (server will do so on get direct messages too)
  socket.emit("get direct messages", friend);
}

// typing indicator
const messageInput = i("message");
if (messageInput) {
  messageInput.addEventListener("input", () => {
    socket.emit("typing");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop typing"), 1000);
  });
}

// cookie helper
function getCookie(name) { return document.cookie.split('; ').find(row => row.startsWith(name + '='))?.split('=')[1]; }

// auto-login if token cookie exists
const token = getCookie("token");
if (token) socket.emit("token login", token);

// socket event handlers
socket.on("sign in success", u => { currentUser = u; showScreen("chat-screen"); socket.emit("get sidebar"); socket.emit("get groups"); });
socket.on("sign up success", (username) => { currentUser = username; showScreen("chat-screen"); socket.emit("get groups"); });
socket.on("sign in error", err => { alert("❌ " + err); const p = i("signin-password"); if (p) p.value = ""; });
socket.on("sign up error", err => { alert("❌ " + err); const p = i("signup-password"); if (p) p.value = ""; const c = i("signup-confirm-password"); if (c) c.value = ""; });

socket.on("sidebar data", ({ friends, friendRequests }) => { setFriendsList(friends || []); setFriendRequestsList(friendRequests || []); });
socket.on("groups list", (groups) => { setGroupsList(groups || []); });

socket.on("previous messages", msgs => { const container = i("messages"); if(container){ container.innerHTML = ""; (msgs||[]).forEach(addMessage); } });
socket.on("chat message", (msg) => { if (currentChat.type === "group" && String(msg.groupId) === String(currentChat.groupId)) addMessage(msg); else if (!msg.groupId) addMessage(msg); });
socket.on("direct messages", ({ friend, msgs }) => { if (currentChat.type === "dm" && currentChat.friend === friend) { const container = i("messages"); if(container){ container.innerHTML = ""; (msgs||[]).forEach(addMessage); currentChat.loaded = true; } } });
socket.on("direct message", msg => {
  if (currentChat.type === "dm" && (msg.from === currentChat.friend || msg.to === currentUser)) addMessage(msg);
  else if (msg.to === currentUser) highlightDM(msg.from);
});
socket.on("message deleted", id => { const el = i(id); if (el) el.remove(); });
socket.on("message edited", msg => { const el = i(msg._id)?.querySelector(".text"); if (el) el.textContent = decodeForDisplay(msg.text); });
socket.on("online users", setOnlineUsers);
socket.on("reaction updated", ({ msgId, reactions }) => {
  const msgEl = i(msgId); if (!msgEl) return;
  const reactionsDiv = msgEl.querySelector(".reactions"); if (reactionsDiv) {
    reactionsDiv.innerHTML = "";
    let entries = Object.entries(reactions || {});
    for (const [emoji, users] of entries) {
      const span = document.createElement("span");
      span.textContent = `${emoji} ${users.length}`;
      span.addEventListener("click", () => { socket.emit(users.includes(currentUser) ? "remove reaction" : "add reaction", { msgId, emoji }); });
      reactionsDiv.appendChild(span);
    }
  }
});

socket.on("delivered update", ({ msgId, username, type }) => {
  const msgEl = i(msgId); if (!msgEl) return;
  const ticks = msgEl.querySelector(".ticks"); if (ticks) { ticks.textContent = "✓✓"; ticks.classList.remove("sent"); ticks.classList.add("delivered"); }
});

socket.on("seen update", ({ msgId, username, type }) => {
  const msgEl = i(msgId); if (!msgEl) return;
  const meta = msgEl.querySelector(".meta"); if (!meta) return;
  const isMine = meta.textContent.startsWith(currentUser);
  if (!isMine) return;
  const ticks = msgEl.querySelector(".ticks");
  if (type === "dm") { if (ticks) { ticks.textContent = "✓✓"; ticks.classList.remove("delivered"); ticks.classList.add("seen"); } }
  else if (type === "group") {
    const seenDiv = msgEl.querySelector(".seen-by");
    if (seenDiv && !seenDiv.textContent.includes(username)) seenDiv.textContent = seenDiv.textContent ? seenDiv.textContent + ", " + username : "Seen by: " + username;
    if (ticks) { ticks.textContent = "✓✓"; ticks.classList.remove("sent"); ticks.classList.add("delivered"); }
  }
});

socket.on("typing", (username) => { if (username !== currentUser) typingUsers.add(username); updateTypingIndicator(); });
socket.on("stop typing", (username) => { typingUsers.delete(username); updateTypingIndicator(); });

function updateTypingIndicator() {
  const indicator = i("typing-indicator"); if (!indicator) return;
  const users = [...typingUsers];
  if (users.length === 0) indicator.textContent = "";
  else if (users.length === 1) indicator.textContent = `${users[0]} is typing...`;
  else if (users.length === 2) indicator.textContent = `${users[0]} and ${users[1]} are typing...`;
  else if (users.length === 3) indicator.textContent = `${users[0]}, ${users[1]} and ${users[2]} are typing...`;
  else indicator.textContent = "Many people are typing...";
}

// form handlers
const messageForm = i("message-form");
if (messageForm) messageForm.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });

const fileInput = i("file-input");
if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadFile(file); // pushes to uploadingFiles
    e.target.value = "";
  });
}

// profile + logout
function logout() { document.cookie = "token=; path=/; max-age=0"; location.reload(); }
export { logout, signup, signIn, sendMessage, showScreen, addMessage, deleteMessage, editMessage, sendFriendRequest, acceptFriend, declineFriend, openGroup, openDM, getCookie, createGroup };