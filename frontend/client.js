const socket = io(window.location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");
let currentUser = "";

// Import Firebase functions (using ES modules via CDN)
import { registerForPush } from './firebase-init.js';  // make sure this path is correct and firebase-init.js is a module

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((div) => div.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function signUp() {
  const username = document.getElementById("signup-username").value;
  const password = document.getElementById("signup-password").value;
  socket.emit("sign up", { username, password });
}

function signIn() {
  const username = document.getElementById("signin-username").value;
  const password = document.getElementById("signin-password").value;
  socket.emit("sign in", { username, password });
}

// Register push after successful sign-in
socket.on("sign in success", async (username) => {
  currentUser = username;
  alert("✅ Welcome, " + username + "!");
  showScreen("chat-screen");

  try {
    const token = await registerForPush(currentUser);
    console.log('Push token registered:', token);
  } catch (err) {
    console.error('Push registration failed:', err);
  }
});

function sendMessage() {
  const text = document.getElementById("message").value;
  if (!text.trim()) return;

  socket.emit("chat message", {
    username: currentUser,
    text
  });

  document.getElementById("message").value = "";
}

// socket events
socket.on("sign up success", () => {
  alert("✅ Signed up! Now sign in.");
  showScreen("signin-screen");
});

socket.on("sign up fail", (msg) => {
  alert(msg);
});

socket.on("sign in fail", (msg) => {
  alert(msg);
});

socket.on("chat message", (msg) => {
  addMessage(msg);
});

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
        <button onclick="editMessage('${msg._id}', '${msg.text.replace(/'/g, "\\'")}')">✏️</button>
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
  if (el) {
    el.querySelector(".text").textContent = msg.text;
  }
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
