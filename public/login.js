import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
} from "./fireBaseScript.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
document.addEventListener('DOMContentLoaded', function () {
document.getElementById("login-button").addEventListener("click", () => {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  // signInWithEmail(email, password)
  //   .then((userCredential) => {
  //     console.log("Logged in:", userCredential.user);
  //     window.location.href = "index.html"; // Redirect to home page
  //   })
  //   .catch((error) => {
  //     console.error("Login error:", error);
  //     alert(error.message);
  //   });
  signInWithEmail(email, password)
  .then((userCredential) => {
    console.log("Logged in:", userCredential.user);
    // Fetch user info
    const db = getFirestore();
    const docRef = doc(db, "userInfo", userCredential.user.uid);
    getDoc(docRef).then((docSnap) => {
      if (docSnap.exists()) {
        console.log("username", docSnap.data().username);

        localStorage.setItem("username", docSnap.data().username); // Store the username
        window.location.href = "index.html"; // Redirect to home page
      } else {
        console.log("No such document!");
      }
    }).catch((error) => {
      console.error("Error getting document:", error);
    });
  })
  .catch((error) => {
    console.error("Login error:", error);
    alert(error.message);
  });

});
});

document.getElementById("signup-button").addEventListener("click", () => {
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  signUpWithEmail(email, password)
    .then((userCredential) => {
      console.log("Signed up:", userCredential.user);
      localStorage.setItem("username", username);
      window.location.href = "index.html"; // Redirect to home page
    })
    .catch((error) => {
      console.error("Sign-up error:", error);
      alert(error.message);
    });
});

document.getElementById("google-login-button").addEventListener("click", () => {
  signInWithGoogle()
    .then((result) => {
      console.log("Logged in with Google:", result.user);
      window.location.href = "index.html"; // Redirect to home page
    })
    .catch((error) => {
      console.error("Google login error:", error);
      alert(error.message);
    });
});

document.getElementById("show-signup").addEventListener("click", () => {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("signup-form").style.display = "block";
});

document.getElementById("show-login").addEventListener("click", () => {
  document.getElementById("signup-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
});

document
  .getElementById("reset-password-button")
  .addEventListener("click", () => {
    const email = document.getElementById("reset-password-email").value;

    sendPasswordResetEmail(email)
      .then(() => {
        console.log("Password reset email sent");
        alert("Password reset email sent. Please check your inbox.");
      })
      .catch((error) => {
        console.error("Password reset error:", error);
        alert(error.message);
      });
  });
