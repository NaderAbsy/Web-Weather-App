import { signUpWithEmail } from "./fireBaseScript.js";

document.getElementById("signup-button").addEventListener("click", async () => {
  const firstName = document.getElementById("signup-first-name").value;
  const lastName = document.getElementById("signup-last-name").value;
  const username = document.getElementById("signup-username").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const retypePassword = document.getElementById(
    "signup-retype-password"
  ).value;

  if (password !== retypePassword) {
    alert("Passwords do not match");
    return;
  }

  try {
    const user = await signUpWithEmail(
      email,
      password,
      firstName,
      lastName,
      username
    );
    alert(
      "A verification email has been sent to your email address. Please verify your email before logging in."
    );
    window.location.href = "login.html";
  } catch (error) {
    console.error("Sign-up error:", error);
    alert(error.message);
  }
});
