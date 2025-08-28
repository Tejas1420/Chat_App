
import { 
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
} from './client.js'; 


document.addEventListener("DOMContentLoaded", () => {
  
  const signupBtn = document.getElementById("signup-btn");
  if (signupBtn) signupBtn.addEventListener("click", () => signUp());

  
  const signinSwitch = document.getElementById("signin-switch-btn");
  if (signinSwitch) signinSwitch.addEventListener("click", () => showScreen("signin-screen"));

  
  const signinBtn = document.getElementById("signin-btn");
  if (signinBtn) signinBtn.addEventListener("click", () => signIn());

  
  const signupSwitch = document.getElementById("signup-switch-btn");
  if (signupSwitch) signupSwitch.addEventListener("click", () => showScreen("signup-screen"));

  
  const darkToggle = document.getElementById("darkModeToggle");
  if (darkToggle) {
    darkToggle.addEventListener("click", () => {
      if (typeof toggleDarkMode === "function") toggleDarkMode();
    });
  }

  
  const addFriendBtn = document.getElementById("add-friend-btn");
  if (addFriendBtn) addFriendBtn.addEventListener("click", () => sendFriendRequest());

  
  const signupShow = document.getElementById("signup-show-password");
  if (signupShow) {
    signupShow.addEventListener("change", function() {
      togglePassword("signup-password", "signup-confirm-password", this);
    });
  }

  
  const signinShow = document.getElementById("signin-show-password");
  if (signinShow) {
    signinShow.addEventListener("change", function() {
      togglePassword("signin-password", null, this);
    });
  }

  
  const msgForm = document.getElementById("message-form");
  if (msgForm) {
    msgForm.addEventListener("submit", function(e) {
      e.preventDefault();
      sendMessage();
    });
  }
});


function togglePassword(id1, id2, checkbox) {
  const el1 = document.getElementById(id1);
  const el2 = id2 ? document.getElementById(id2) : null;
  const type = checkbox.checked ? "text" : "password";
  if (el1) el1.type = type;
  if (el2) el2.type = type;
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("dm-btn")) {
    const user = e.target.dataset.user;
    openDM(user);
  }
  if (e.target.classList.contains("accept-btn")) {
    const user = e.target.dataset.user;
    acceptFriend(user);
  }
  if (e.target.classList.contains("decline-btn")) {
    const user = e.target.dataset.user;
    declineFriend(user);
  }
});
// made by tejas singh