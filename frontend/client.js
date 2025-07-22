const socket = io(window.location.hostname.includes("localhost") ? "http://localhost:3000" : "https://chat-app-4x3l.onrender.com");
let currentUser = "";


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

function sendMessage() {
  const text = document.getElementById("message").value;
  if (!text.trim()) return;

  socket.emit("chat message", {
    username: currentUser, // ✅ send username!
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

socket.on("sign in success", (username) => {
  currentUser = username; // ✅ store the username!
  alert("✅ Welcome, " + username + "!");
  showScreen("chat-screen");
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
  li.innerHTML = `
    <div class="bubble">
      <div class="meta"><strong>${msg.username}</strong> 🕒 ${msg.time} 📅 ${msg.date}</div>
      <div class="text">${msg.text}</div>
    </div>
  `;
  document.getElementById("messages").appendChild(li);
}


