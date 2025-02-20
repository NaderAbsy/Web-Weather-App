import { sendPasswordReset } from "./fireBaseScript.js";

document
  .getElementById("reset-password-button")
  .addEventListener("click", async () => {
    const email = document.getElementById("reset-email").value;
    const messageDiv = document.getElementById("message");

    try {
      await sendPasswordReset(email);
      messageDiv.textContent =
        "Password reset email sent. Please check your inbox.";
      messageDiv.style.color = "green";
    } catch (error) {
      console.error("Error sending password reset email:", error);
      messageDiv.textContent = error.message;
      messageDiv.style.color = "red";
    }
  });
