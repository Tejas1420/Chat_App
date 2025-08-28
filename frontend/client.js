// ✅ Socket setup (local or render)
const socket = io(location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");

// ✅ Helpers
const i = id => document.getElementById(id);
const q = id => document.getElementById(id);
const v = id => i(id).value;
function setList(id, arr) {
  const el = i(id);
  if (!el) return; // element not found, do nothing
  el.innerHTML = arr.join("");
}


let currentUser = "";
let typingTimeout;

// ✅ Service Worker + Push
import { registerForPush } from './firebase-init.js';

let swReady = Promise.resolve();

if ('serviceWorker' in navigator) {
  swReady = navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(reg => navigator.serviceWorker.ready)
    .then(() => console.log("SW registered and ready"))
    .catch(console.error);
}

// ✅ Screen switcher
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(div => div.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ✅ Auth
function signUp() {
  const u = v("signup-username"), p = v("signup-password"), c = v("signup-confirm-password");
  if (p !== c) return alert("Passwords don’t match!");
  socket.emit("sign up", { username: u, password: p });
}
function signIn() {
  socket.emit("sign in", { username: v("signin-username"), password: v("signin-password") });
}

function highlightDM(friend) {
  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) {
    btn.classList.add("new-message"); // add CSS class for highlight
  }
}

socket.on("sign in success", async (u) => {
  currentUser = u;
  showScreen("chat-screen");
  socket.emit("get sidebar");

  try {
    await swReady;
    const fcmToken = await registerForPush(u);
    if (fcmToken) {
await fetch("/api/register-token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: currentUser, fcmToken }),
});

    }
  } catch (err) {
    console.error("Push registration failed:", err);
  }
});



// ✅ After sign up
socket.on("sign up success", () => {
  alert("✅ Signed Up! Now Sign In");
  showScreen("signin-screen");
});
socket.on("sign in error", (err) => {
  alert("❌ " + err);
  i("signin-password").value = "";
});
socket.on("sign up error", (err) => {
  alert("❌ " + err);
  i("signup-password").value = "";
  i("signup-confirm-password").value = "";
});

// ✅ Sidebar
// Sidebar update
socket.on("sidebar data", ({ friends, friendRequests }) => {
// In client.js sidebar render
setList("friends-dm-list", friends.map(f => `
  <li>
    <button class="dm-btn" data-user="${f}">💬 ${f}</button>
  </li>`));

  setList("friend-requests", friendRequests.map(r => `
    <li>${r}
      <button class="accept-btn" data-user="${r}">✅</button>
      <button class="decline-btn" data-user="${r}">❌</button>
    </li>`));
});



// 🔄 Refresh sidebar when server requests it
socket.on("sidebar update", (user) => {
  if (user === currentUser) {
    socket.emit("get sidebar");
  }
});


// ✅ Chat
function sendMessage() {
  const text = v("message");
  if (!text.trim()) return;
  
  if (currentChat.type === "group") {
    socket.emit("chat message", { username: currentUser, text });
  } else if (currentChat.type === "dm") {
    // ✅ Add the message instantly for the sender
    const msg = {
      from: currentUser,
      to: currentChat.friend,
      text,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString()
    };
    addMessage(msg);

    // ✅ Send to server so the other user gets it
    socket.emit("direct message", { to: currentChat.friend, text });
  }

  i("message").value = "";
  socket.emit("stop typing");
}

socket.on("previous messages", msgs => { i("messages").innerHTML = ""; msgs.forEach(addMessage); });
socket.on("chat message", msg => {
  if (currentChat.type === "group") addMessage(msg);
});

socket.on("direct messages", ({ friend, msgs }) => {
  if (currentChat.type === "dm" && currentChat.friend === friend) {
    i("messages").innerHTML = "";
    msgs.forEach(addMessage);
    currentChat.loaded = true; // ✅ mark that history is loaded
  }
});


socket.on("direct message", msg => {
  if (currentChat.type === "dm" &&
     (msg.from === currentChat.friend || msg.to === currentUser)) {
    // ✅ Show instantly in current DM
    addMessage(msg);
  } else {
    // ✅ Only highlight if the message is TO me (not from me)
    if (msg.to === currentUser) {
      highlightDM(msg.from);
    }
  }
});


socket.on("message deleted", id => q(id)?.remove());
socket.on("message edited", msg => {
  const el = q(msg._id)?.querySelector(".text");
  if (el) el.textContent = msg.text;
});

function addMessage(msg) {
  // For group messages use msg.username, for DMs use msg.from
  const sender = msg.username || msg.from;

  const mine = sender === currentUser;
  const li = document.createElement("li");
  li.id = msg._id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<strong>${sender}</strong> 🕒 ${msg.time} 📅 ${msg.date}`;

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

// ✅ Friends
function sendFriendRequest() { const u = prompt("Enter username:"); if (u) socket.emit("send friend request", u); }
function acceptFriend(u) { socket.emit("accept friend request", u); }
function declineFriend(u) { socket.emit("decline friend request", u); }

// ✅ Typing
i("message").addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("stop typing"), 1000);
});

// --- New multi-user typing indicator logic ---
const typingUsers = new Set();

socket.on("typing", (username) => {
  if (username !== currentUser) {
    typingUsers.add(username);
    updateTypingIndicator();
  }
});

socket.on("stop typing", (username) => {
  typingUsers.delete(username);
  updateTypingIndicator();
});

function updateTypingIndicator() {
  const indicator = i("typing-indicator");
  const users = [...typingUsers];

  if (users.length === 0) {
    indicator.textContent = "";
  } else if (users.length === 1) {
    indicator.textContent = `${users[0]} is typing...`;
  } else if (users.length === 2) {
    indicator.textContent = `${users[0]} and ${users[1]} are typing...`;
  } else if (users.length === 3) {
    indicator.textContent = `${users[0]}, ${users[1]} and ${users[2]} are typing...`;
  } else {
    indicator.textContent = "Many people are typing...";
  }
}

// ✅ Online users
socket.on("online users", users => {
  setList("online-users", users.map(u => `<li style="font-weight:${u===currentUser?"bold":"normal"}">${u}</li>`));
});

let currentChat = { type: "group", friend: null };

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

  // ✅ remove highlight when opening
  const btn = document.querySelector(`.dm-btn[data-user="${friend}"]`);
  if (btn) btn.classList.remove("new-message");

  socket.emit("get direct messages", friend);
}


i("message-form").addEventListener("submit", e => {
  e.preventDefault();
  sendMessage();
});

i("group-chat-btn").addEventListener("click", openGroupChat);

export {
  signUp,
  signIn,
  sendMessage,
  showScreen,
  addMessage,
  deleteMessage,
  editMessage,
  sendFriendRequest,
  acceptFriend,
  declineFriend,
  openGroupChat,
  openDM
};

// made by tejas singh