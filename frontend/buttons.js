// frontend/buttons.js
// Button and input bindings (CSP safe)

import { signup, signIn, sendMessage, logout, addFriend, createGroup, toggleDarkMode } from "./client.js";

document.addEventListener("DOMContentLoaded", () => {
  // Auth
  const signupBtn = document.getElementById("signup-btn");
  const signinBtn = document.getElementById("signin-btn");

  if (signupBtn) {
    signupBtn.addEventListener("click", () => {
      const username = document.getElementById("signup-username").value.trim();
      const password = document.getElementById("signup-password").value.trim();
      signup(username, password);
    });
  }

  if (signinBtn) {
    signinBtn.addEventListener("click", () => {
      const username = document.getElementById("signin-username").value.trim();
      const password = document.getElementById("signin-password").value.trim();
      signIn(username, password);
    });
  }

  // Chat send
  const sendBtn = document.getElementById("send-btn");
  const msgInput = document.getElementById("message-input");

  if (sendBtn && msgInput) {
    sendBtn.addEventListener("click", () => {
      const text = msgInput.value.trim();
      if (text) {
        sendMessage(text);
        msgInput.value = "";
      }
    });

    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  // Sidebar actions
  const addFriendBtn = document.getElementById("add-friend-btn");
  if (addFriendBtn) {
    addFriendBtn.addEventListener("click", () => {
      const friend = prompt("Enter username to add:");
      if (friend) addFriend(friend.trim());
    });
  }

  const createGroupBtn = document.getElementById("create-group-btn");
  if (createGroupBtn) {
    createGroupBtn.addEventListener("click", () => {
      const group = prompt("Enter group name:");
      if (group) createGroup(group.trim());
    });
  }

  const darkBtn = document.getElementById("dark-mode-btn");
  if (darkBtn) {
    darkBtn.addEventListener("click", toggleDarkMode);
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
});