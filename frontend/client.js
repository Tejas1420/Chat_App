const socket = io(window.location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");
let currentUser = "";
let typingTimeout;

// Register service worker for push
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(reg => console.log('Service Worker registered:', reg.scope))
    .catch(err => console.error('SW registration failed:', err));
}

import { registerForPush } from './firebase-init.js';

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(div => div.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function signUp() {
  const username = document.getElementById("signup-username").value;
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-confirm-password").value;
  if (password !== confirm) return alert("Passwords do not match!");
  socket.emit("sign up", { username, password });
}

function signIn() {
  const username = document.getElementById("signin-username").value;
  const password = document.getElementById("signin-password").value;
  socket.emit("sign in", { username, password });
}

socket.on("sign in success", async (username) => {
  currentUser = username;
  alert("✅ Welcome, " + username + "!");
  showScreen("chat-screen");
  socket.emit("get sidebar");
  try {
    await registerForPush(currentUser);
  } catch (err) {
    console.error('Push registration failed:', err);
  }
});

socket.on("sidebar data", ({ friends, friendRequests }) => {
  const friendsList = document.getElementById("friends-list");
  const requestsList = document.getElementById("friend-requests");

  friendsList.innerHTML = friends.map(f => `<li>${f}</li>`).join("");
  requestsList.innerHTML = friendRequests.map(r => `
    <li>
      ${r}
      <button onclick="acceptFriend('${r}')">✅</button>
      <button onclick="declineFriend('${r}')">❌</button>
    </li>
  `).join("");
});

function sendMessage() {
  const text = document.getElementById("message").value;
  if (!text.trim()) return;
  socket.emit("chat message", { username: currentUser, text });
  document.getElementById("message").value = "";
  socket.emit("stop typing"); // stop typing after send
}

socket.on("sign up success", () => {
  alert("✅ Signed up! Now sign in.");
  showScreen("signin-screen");
});

socket.on("sign up fail", (msg) => alert(msg));
socket.on("sign in fail", (msg) => alert(msg));

socket.on("chat message", (msg) => addMessage(msg));

socket.on("previous messages", (msgs) => {
  const list = document.getElementById("messages");
  list.innerHTML = "";
  msgs.forEach(addMessage);
});

function addMessage(msg) {
  const li = document.createElement("li");
  li.id = msg._id;
  li.innerHTML = `
    <div class="bubble">
      <div class="meta"><strong>${msg.username}</strong> 🕒 ${msg.time} 📅 ${msg.date}</div>
      <div class="text">${msg.text}</div>
      ${msg.username === currentUser ? `
        <button onclick="deleteMessage('${msg._id}')">🗑️</button>
                <button onclick="editMessage('${msg._id}', '${msg.text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">✏️</button>
      ` : ''}
    </div>
  `;
  document.getElementById("messages").appendChild(li);
}

socket.on("message deleted", (id) => {
  const el = document.getElementById(id);
  if (el) el.remove();
});

socket.on("message edited", (msg) => {
  const el = document.getElementById(msg._id);
  if (el) el.querySelector(".text").textContent = msg.text;
});

function deleteMessage(id) {
  socket.emit("delete message", id);
}

function editMessage(id, oldText) {
  const newText = prompt("Edit message:", oldText);
  if (newText && newText.trim()) {
    socket.emit("edit message", { id, newText });
  }
}

function sendFriendRequest() {
  const target = prompt("Enter username to friend:");
  if (target) socket.emit("send friend request", target);
}
function acceptFriend(user) {
  socket.emit("accept friend request", user);
}
function declineFriend(user) {
  socket.emit("decline friend request", user);
}
Object.assign(window, { sendFriendRequest, acceptFriend, declineFriend });

// ✅ Typing indicator handling
document.getElementById("message").addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop typing");
  }, 1000);
});

socket.on("typing", (username) => {
  if (username === currentUser) return;
  const indicator = document.getElementById("typing-indicator");
  indicator.textContent = `${username} is typing...`;
});

socket.on("stop typing", (username) => {
  const indicator = document.getElementById("typing-indicator");
  indicator.textContent = "";
});

// ✅ Online users list
socket.on("online users", (users) => {
  const list = document.getElementById("online-users");
  list.innerHTML = "";
  users.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user;
    if (user === currentUser) li.style.fontWeight = "bold";
    list.appendChild(li);
  });
});

Object.assign(window, { signUp, signIn, sendMessage, showScreen, addMessage, deleteMessage, editMessage });

// made by tejas singh