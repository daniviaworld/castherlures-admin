import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Si ya hay sesión iniciada, saltar directo al panel
onAuthStateChanged(auth, (user) => {
  if (user && location.pathname.endsWith("index.html") || user && location.pathname === "/") {
    location.href = "dashboard.html";
  }
});

const form = document.getElementById("login-form");
if (form) {
  const btn = document.getElementById("login-btn");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Entrando…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      location.href = "dashboard.html";
    } catch (err) {
      errorEl.textContent = "Correo o contraseña incorrectos.";
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });
}
