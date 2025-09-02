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
  i(id).classList.add("active");
}

function signUp() {
  const u = v("signup-username"), p = v("signup-password"), c = v("signup-confirm-password");
  if (p !== c) return alert("Passwords don’t match!");
  socket.emit("sign up", { username: u, password: p });
}

function signIn() {
  socket.emit("sign in", { username: v("signin-username"), password: v("signin-password") });
}

// ---------------- CHAT HANDLERS ----------------
function addMessage(msg) {
  const sender = msg.username || msg.from;
  const mine = sender === currentUser;

  const li = document.createElement("li");
  li.id = msg._id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${sender} 🕒 ${msg.time || ""} 📅 ${msg.date || ""}`;

  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.textContent = decodeForDisplay(msg.text);

  bubble.appendChild(meta);
  bubble.appendChild(textDiv);
// Reactions container
const reactionsDiv = document.createElement("div");
reactionsDiv.className = "reactions";
if(msg.reactions){
  for(const [emoji, users] of Object.entries(msg.reactions)){
    const span = document.createElement("span");
    span.textContent = `${emoji} ${users.length}`;
    span.addEventListener("click", () => {
      socket.emit(users.includes(currentUser) ? "remove reaction" : "add reaction", { msgId: msg._id, emoji });
    });
    reactionsDiv.appendChild(span);
  }
}
bubble.appendChild(reactionsDiv);

// Seen-by container
const seenDiv = document.createElement("div");
seenDiv.className = "seen-by";
if(msg.seen?.length) seenDiv.textContent = "Seen by: " + msg.seen.join(", ");
bubble.appendChild(seenDiv);

// Emit "message seen" when message comes into view
if(currentChat.type === "group" || currentChat.type === "dm") {
  socket.emit("message seen", msg._id);
}
  if (mine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => {
      li.remove(); // remove from DOM immediately
      if (currentChat.type === "group") {
        socket.emit("delete message", msg._id);
      } else if (currentChat.type === "dm") {
        socket.emit("delete dm", { to: currentChat.friend, id: msg._id });
      }
    });

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => {
      const text = prompt("Edit:", msg.text);
      if (!text?.trim()) return;
      textDiv.textContent = text; // update DOM
      msg.text = text; // update local object
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
  i("messages").appendChild(li);
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
  i("message").value = "";
  socket.emit("stop typing");
}

function sendFriendRequest() { const u = prompt("Enter username:"); if (u) socket.emit("send friend request", u); }
function acceptFriend(u) { socket.emit("accept friend request", u); }
function declineFriend(u) { socket.emit("decline friend request", u); }

function openGroupChat() {
  currentChat = { type: "group", friend: null };
  i("chat-title").textContent = "🌍 Group Chat";
  i("messages").innerHTML = "";
  socket.emit("get group messages");
}

function openDM(friend) {
  currentChat = { type: "dm", friend, loaded: false };
  i("chat-title").textContent = "💬 DM with " + friend;
  i("messages").innerHTML = "";

  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.remove("new-message");

  socket.emit("get direct messages", friend);
}

// ---------------- TYPING INDICATOR ----------------
i("message").addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("stop typing"), 1000);
});

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
socket.on("sign in error", err => { alert("❌ " + err); i("signin-password").value = ""; });
socket.on("sign up error", err => { alert("❌ " + err); i("signup-password").value = ""; i("signup-confirm-password").value = ""; });

socket.on("sidebar data", ({ friends, friendRequests }) => {
  setFriendsList(friends);
  setFriendRequestsList(friendRequests);
});

socket.on("sidebar update", (user) => { if (user === currentUser) socket.emit("get sidebar"); });

socket.on("previous messages", msgs => { i("messages").innerHTML = ""; msgs.forEach(addMessage); });
socket.on("chat message", addMessage);
socket.on("direct messages", ({ friend, msgs }) => {
  if (currentChat.type === "dm" && currentChat.friend === friend) { i("messages").innerHTML = ""; msgs.forEach(addMessage); currentChat.loaded = true; }
});
socket.on("direct message", msg => {
  if (currentChat.type === "dm" && (msg.from === currentChat.friend || msg.to === currentUser)) addMessage(msg);
  else if (msg.to === currentUser) highlightDM(msg.from);
});
socket.on("message deleted", id => i(id)?.remove());
socket.on("message edited", msg => { const el = i(msg._id)?.querySelector(".text"); if (el) el.textContent = msg.text; });
socket.on("online users", setOnlineUsers);
// update reactions in real-time
socket.on("reaction updated", ({ msgId, reactions }) => {
  const msgEl = i(msgId);
  if(!msgEl) return;
  const reactionsDiv = msgEl.querySelector(".reactions");
  if(reactionsDiv) {
    reactionsDiv.innerHTML = "";
    for(const [emoji, users] of Object.entries(reactions)){
      const span = document.createElement("span");
      span.textContent = `${emoji} ${users.length}`;
      reactionsDiv.appendChild(span);
    }
  }
});

// update seen
socket.on("message seen", ({ msgId, username }) => {
  const msgEl = i(msgId);
  if(!msgEl) return;
  const seenDiv = msgEl.querySelector(".seen-by");
  if(seenDiv) {
    if(seenDiv.textContent) seenDiv.textContent += ", " + username;
    else seenDiv.textContent = "Seen by: " + username;
  }
});

// ---------------- FORM + BUTTON HANDLERS ----------------
i("signup-btn").addEventListener("click", signUp);
i("signin-btn").addEventListener("click", signIn);
i("signup-switch-btn").addEventListener("click", () => showScreen("signup-screen"));
i("signin-switch-btn").addEventListener("click", () => showScreen("signin-screen"));
i("group-chat-btn").addEventListener("click", openGroupChat);
i("add-friend-btn").addEventListener("click", sendFriendRequest);

i("message-form").addEventListener("submit", e => { e.preventDefault(); sendMessage(); });

function getCookie(name) {
  return document.cookie.split('; ').find(row => row.startsWith(name + '='))?.split('=')[1];
}

// auto-login if token exists
const token = getCookie("token");
if (token) socket.emit("token login", token);

// save JWT sent from server
socket.on("set-cookie", token => {
  const maxAge = 2 * 365 * 24 * 60 * 60; // 2 years in seconds
  document.cookie = `token=${token}; path=/; secure; samesite=strict; max-age=${maxAge}`;
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

// ✅ Export the logout function
export {
  logout,  // now properly defined
  signUp, signIn, sendMessage, showScreen,
  addMessage, deleteMessage, editMessage,
  sendFriendRequest, acceptFriend, declineFriend,
  openGroupChat, openDM, getCookie
};