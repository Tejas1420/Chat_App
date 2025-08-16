// ✅ Socket setup (local or render)
const socket = io(location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");
let currentUser = "";
let typingTimeout;

// ✅ Service Worker + Push
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(reg => console.log("SW registered:", reg.scope))
    .catch(console.error);
}
import { registerForPush } from './firebase-init.js';

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

// ✅ After login
socket.on("sign in success", async (u) => {
  currentUser = u;
  alert("✅ Welcome, " + u);
  showScreen("chat-screen");
  socket.emit("get sidebar");
  try { await registerForPush(u); } catch (e) { console.error(e); }
});

// ✅ Sidebar
socket.on("sidebar data", ({ friends, friendRequests }) => {
  setList("friends-list", friends.map(f => `<li>${f}</li>`));
  setList("friend-requests", friendRequests.map(r => `
    <li>${r}
      <button onclick="acceptFriend('${r}')">✅</button>
      <button onclick="declineFriend('${r}')">❌</button>
    </li>`));
});

// ✅ Chat
function sendMessage() {
  const text = v("message");
  if (!text.trim()) return;
  socket.emit("chat message", { username: currentUser, text });
  i("message").value = "";
  socket.emit("stop typing");
}
socket.on("previous messages", msgs => { i("messages").innerHTML = ""; msgs.forEach(addMessage); });
socket.on("chat message", addMessage);
socket.on("message deleted", id => q(id)?.remove());
socket.on("message edited", msg => q(msg._id)?.querySelector(".text").textContent = msg.text);

function addMessage(msg) {
  const mine = msg.username === currentUser;
  i("messages").insertAdjacentHTML("beforeend", `
    <li id="${msg._id}">
      <div class="bubble">
        <div class="meta"><strong>${msg.username}</strong> 🕒 ${msg.time} 📅 ${msg.date}</div>
        <div class="text">${msg.text}</div>
        ${mine ? `
          <button onclick="deleteMessage('${msg._id}')">🗑️</button>
          <button onclick="editMessage('${msg._id}','${msg.text.replace(/\\/g,"\\\\").replace(/'/g,"\\'")}')">✏️</button>` : ""}
      </div>
    </li>`);
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
socket.on("typing", u => { if (u !== currentUser) i("typing-indicator").textContent = `${u} is typing...`; });
socket.on("stop typing", () => i("typing-indicator").textContent = "");

// ✅ Online users
socket.on("online users", users => {
  setList("online-users", users.map(u => `<li style="font-weight:${u===currentUser?"bold":"normal"}">${u}</li>`));
});

// ✅ Helpers
const i = id => document.getElementById(id);
const q = id => document.getElementById(id);
const v = id => i(id).value;
function setList(id, arr) { i(id).innerHTML = arr.join(""); }

// Export funcs to window (for HTML onclick)
Object.assign(window, { signUp, signIn, sendMessage, showScreen, addMessage, deleteMessage, editMessage, sendFriendRequest, acceptFriend, declineFriend });

// made by tejas singh