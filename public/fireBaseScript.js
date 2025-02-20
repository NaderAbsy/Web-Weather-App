import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHFu4VIP4tsKBqLzH53touCT4J54JjeMc",
  authDomain: "weather-web-v1.firebaseapp.com",
  projectId: "weather-web-v1",
  storageBucket: "weather-web-v1.appspot.com",
  messagingSenderId: "961894784985",
  appId: "1:961894784985:web:30f9ad3ae662cf6d9dc3c8",
  measurementId: "G-WZ0BR6176N",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const validDomains = ["gmail.com", "yahoo.com", "outlook.com"];

const isValidEmailDomain = (email) => {
  const emailDomain = email.split("@")[1];
  return validDomains.includes(emailDomain);
};

export const checkUsernameExists = async (username) => {
  const q = query(
    collection(db, "userInfo"),
    where("username", "==", username)
  );
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
};

export const signUpWithEmail = async (
  email,
  password,
  firstName,
  lastName,
  username
) => {
  if (!isValidEmailDomain(email)) {
    throw new Error(
      "Invalid email domain. Please use a valid email address such as Gmail, Yahoo, or Outlook."
    );
  }

  const usernameExists = await checkUsernameExists(username);
  if (usernameExists) {
    throw new Error("Username already exists");
  }

  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  const user = userCredential.user;

  await setDoc(doc(db, "userInfo", user.uid), {
    firstName: firstName,
    lastName: lastName,
    username: username,
    email: email,
  });

  await sendEmailVerification(user);

  return user;
};

export const signInWithEmail = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signInWithGoogle = () => {
  return signInWithPopup(auth, googleProvider);
};

export const logOut = () => {
  return signOut(auth);
};

export const sendPasswordReset = (email) => {
  return sendPasswordResetEmail(auth, email);
};
