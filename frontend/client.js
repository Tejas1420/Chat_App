const socket = io(window.location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");

let currentUser = "";
let currentChat = "general";

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((div) => div.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function signUp() {
  const username = document.getElementById("signup-username").value.trim();
  const password = document.getElementById("signup-password").value.trim();
  if (!username || !password) return alert("Username and password required.");
  socket.emit("sign up", { username, password });
}

function signIn() {
  const username = document.getElementById("signin-username").value.trim();
  const password = document.getElementById("signin-password").value.trim();
  if (!username || !password) return alert("Username and password required.");
  socket.emit("sign in", { username, password });
}

function sendMessage() {
  const text = document.getElementById("message").value;
  if (!text.trim()) return;

  socket.emit("chat message", {
    username: currentUser,
    text: escapeHTML(text),
    groupId: currentChat
  });

  document.getElementById("message").value = "";
}

socket.on("chat message", (msg) => {
  if (msg.groupId === currentChat) {
    addMessage(msg);
  }
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
      <div class="meta"><strong>${escapeHTML(msg.username)}</strong> 🕒 ${msg.time} 📅 ${msg.date}</div>
      <div class="text">${escapeHTML(msg.text)}</div>
      ${msg.username === currentUser ? `
        <button onclick="deleteMessage('${msg._id}')">🗑️</button>
        <button onclick="editMessage('${msg._id}', '${escapeHTML(msg.text).replace(/'/g, "\\'")}")">✏️</button>
      ` : ''}
    </div>
  `;
  document.getElementById("messages").appendChild(li);
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function deleteMessage(id) {
  socket.emit("delete message", { id });
}

function editMessage(id, oldText) {
  const newText = prompt("Edit message:", oldText);
  if (newText && newText.trim()) {
    socket.emit("edit message", { id, newText: escapeHTML(newText), groupId: currentChat });
  }
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

socket.on("sign up success", () => {
  alert("✅ Signed up! Now sign in.");
  showScreen("signin-screen");
});

socket.on("sign up fail", (msg) => {
  alert(msg);
});

socket.on("sign in success", (username) => {
  currentUser = username;
  alert("✅ Welcome, " + username + "!");
  showScreen("chat-screen");
  switchChat("general");
  socket.emit("join group", "general");
});

socket.on("sign in fail", (msg) => {
  alert(msg);
});

function switchChat(chatId) {
  currentChat = chatId;
  document.getElementById("chat-title").textContent =
    chatId === "general" ? "🌐 General" : chatId.includes("group-") ? `👥 ${chatId.slice(6)}` : `👤 DM with ${chatId.replace(currentUser, "").replace("-", "")}`;
  document.getElementById("messages").innerHTML = "";
  socket.emit("get messages", chatId);
}

function startNewDM() {
  const friend = prompt("Enter your friend's username:");
  if (friend && friend !== currentUser) {
    const chatId = [currentUser, friend].sort().join("-");
    switchChat(chatId);
  }
}

function joinGroup() {
  const group = prompt("Enter group name:");
  if (group) {
    const chatId = "group-" + group.toLowerCase();
    switchChat(chatId);
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, (tag) => {
    const chars = {
      '&': "&amp;",
      '<': "&lt;",
      '>': "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return chars[tag] || tag;
  });
}
