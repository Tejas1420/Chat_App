const socket = io(location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");

const i = id => document.getElementById(id);
const v = id => i(id).value;

let currentUser = "";
let typingTimeout;
let currentChat = { type: "group", friend: null };
const typingUsers = new Set();

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
  meta.textContent = `${sender} 🕒 ${msg.time} 📅 ${msg.date}`;

  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.textContent = msg.text;

  bubble.appendChild(meta);
  bubble.appendChild(textDiv);

  if (mine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => deleteMessage(msg._id));
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => editMessage(msg._id, msg.text));
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
socket.on("sign up success", () => { alert("✅ Signed Up! Now Sign In"); showScreen("signin-screen"); });
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

// ---------------- FORM + BUTTON HANDLERS ----------------
i("signup-btn").addEventListener("click", signUp);
i("signin-btn").addEventListener("click", signIn);
i("signup-switch-btn").addEventListener("click", () => showScreen("signup-screen"));
i("signin-switch-btn").addEventListener("click", () => showScreen("signin-screen"));
i("group-chat-btn").addEventListener("click", openGroupChat);
i("add-friend-btn").addEventListener("click", sendFriendRequest);

i("message-form").addEventListener("submit", e => { e.preventDefault(); sendMessage(); });

export {
  signUp, signIn, sendMessage, showScreen,
  addMessage, deleteMessage, editMessage,
  sendFriendRequest, acceptFriend, declineFriend,
  openGroupChat, openDM
};