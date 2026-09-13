/* Auth UI wiring for the main page. */
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { logOut } from "./fireBaseScript.js";

const auth = getAuth();
const db = getFirestore();

const loginButton = document.getElementById("login-button");
const userChip = document.getElementById("user-chip");
const userName = document.getElementById("user-name");
const dropdown = document.getElementById("user-dropdown");
const logoutButton = document.getElementById("logout-button");

function signedOut() {
  loginButton.hidden = false;
  userChip.hidden = true;
  dropdown.hidden = true;
}

function signedIn(label) {
  loginButton.hidden = true;
  userChip.hidden = false;
  userName.textContent = label;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return signedOut();

  if (!user.emailVerified) {
    // Unverified accounts can't stay signed in — send them back to log in.
    await logOut();
    signedOut();
    return;
  }

  let label = user.email;
  try {
    const snap = await getDoc(doc(db, "userInfo", user.uid));
    if (snap.exists() && snap.data().username) label = snap.data().username;
  } catch (e) {
    // Firestore unavailable — fall back to the email address.
  }
  signedIn(label);
});

loginButton.addEventListener("click", () => {
  window.location.href = "login.html";
});

userChip.addEventListener("click", () => {
  const open = dropdown.hidden;
  dropdown.hidden = !open;
  userChip.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (e) => {
  if (!dropdown.hidden && !dropdown.contains(e.target) && !userChip.contains(e.target)) {
    dropdown.hidden = true;
    userChip.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dropdown.hidden) {
    dropdown.hidden = true;
    userChip.setAttribute("aria-expanded", "false");
    userChip.focus();
  }
});

logoutButton.addEventListener("click", async () => {
  await logOut();
  window.location.href = "index.html";
});
