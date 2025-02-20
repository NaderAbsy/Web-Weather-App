import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { logOut } from "./fireBaseScript.js";

const auth = getAuth();
const db = getFirestore();

const loginButton = document.getElementById("login-button");
const userContainer = document.getElementById("user-name");
const userDropdown = document.getElementById("user-dropdown");

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (user.emailVerified) {
      const userDoc = await getDoc(doc(db, "userInfo", user.uid));
      const userInfo = userDoc.data();
      loginButton.innerText = "";
      loginButton.style.display = "none";
      loginButton.removeEventListener("click", redirectToLogin);
      loginButton.addEventListener("click", toggleDropdown);
      userDropdown.style.display = "block";
      userContainer.innerHTML = userInfo.username;
    } else {
      alert("Please verify your email address.");
      await logOut();
      window.location.href = "login.html";
      userContainer.innerHTML = "";
    }
  } else {
    loginButton.innerText = "Log In";
    loginButton.addEventListener("click", redirectToLogin);
    userDropdown.style.display = "none";
  }
});

const redirectToLogin = () => {
  window.location.href = "login.html";
};

const toggleDropdown = () => {
  const dropdown = document.getElementById("user-dropdown");
  dropdown.style.display =
    dropdown.style.display === "block" ? "none" : "block";
};

document.getElementById("logout-button").addEventListener("click", async () => {
  await logOut();
  window.location.href = "index.html";
});

document.addEventListener("DOMContentLoaded", function() {
  const username = localStorage.getItem("username");
  if (username) {
    document.getElementById("user-name-display").textContent = `${username}`;
  } 
});

