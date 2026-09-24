import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
  getDocs, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ---------- Guard de sesión ----------
onAuthStateChanged(auth, (user) => {
  if (!user) location.href = "index.html";
});

document.getElementById("logout").addEventListener("click", () => {
  signOut(auth).then(() => location.href = "index.html");
});

// ---------- Navegación entre vistas ----------
const navItems = document.querySelectorAll(".nav-item");
const views = {
  categorias: document.getElementById("view-categorias"),
  productos: document.getElementById("view-productos"),
  contenido: document.getElementById("view-contenido"),
  estadisticas: document.getElementById("view-estadisticas")
};

navItems.forEach(item => {
  item.addEventListener("click", () => {
    navItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    Object.values(views).forEach(v => v.style.display = "none");
    views[item.dataset.view].style.display = "block";
    if (item.dataset.view === "estadisticas") cargarEstadisticas();
  });
});

// ---------- Utilidades ----------
function slugify(str) {
  return str.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function subirImagen(file, carpeta) {
  const path = `${carpeta}/${Date.now()}-${file.name}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

function money(n) {
  const num = Number(n);
  return Number.isNaN(num) ? n : num.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// ---------- Recorte de imagen (categorías: cuadrado · productos: 4:3) ----------
let cropper = null;
let cropTargetType = null; // "cat" | "prod"

function abrirCrop(file, type) {
  cropTargetType = type;
  const img = document.getElementById("crop-image");
  const reader = new FileReader();
  reader.onload = (ev) => {
    img.src = ev.target.result;
    document.getElementById("modal-crop").style.display = "flex";
    if (cropper) cropper.destroy();
    cropper = new Cropper(img, {
      viewMode: 1,
      autoCropArea: 1,
      background: false
    });
  };
  reader.readAsDataURL(file);
}

document.getElementById("crop-cancel").addEventListener("click", () => {
  document.getElementById("modal-crop").style.display = "none";
  if (cropper) { cropper.destroy(); cropper = null; }
});

document.getElementById("crop-confirm").addEventListener("click", () => {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600, imageSmoothingQuality: "high" });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const namedBlob = new File([blob], "foto.jpg", { type: "image/jpeg" });
    const previewUrl = canvas.toDataURL("image/jpeg", 0.9);
    if (cropTargetType === "cat") {
      catImagenFile = namedBlob;
      document.getElementById("cat-img-preview").src = previewUrl;
    } else {
      prodImagenesNuevas.push({ blob: namedBlob, preview: previewUrl });
      renderGaleriaProd();
    }
    document.getElementById("modal-crop").style.display = "none";
    cropper.destroy();
    cropper = null;
  }, "image/jpeg", 0.9);
});

// ==================================================
// CATEGORÍAS
// ==================================================
const catCol = collection(db, "categorias");
let categoriasCache = [];

const modalCat = document.getElementById("modal-categoria");
const formCat = document.getElementById("form-categoria");
let catImagenFile = null;

document.getElementById("btn-nueva-categoria").addEventListener("click", () => abrirModalCategoria());
document.getElementById("cat-cancel").addEventListener("click", () => modalCat.style.display = "none");
document.getElementById("cat-imagen").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) abrirCrop(f, "cat");
  e.target.value = "";
});

function abrirModalCategoria(cat = null) {
  catImagenFile = null;
  document.getElementById("modal-categoria-title").textContent = cat ? "Editar categoría" : "Nueva categoría";
  document.getElementById("cat-id").value = cat ? cat.id : "";
  document.getElementById("cat-nombre").value = cat ? cat.nombre : "";
  document.getElementById("cat-orden").value = cat ? cat.orden ?? 0 : 0;
  document.getElementById("cat-activo").checked = cat ? cat.activo !== false : true;
  document.getElementById("cat-img-preview").src = cat?.imagen || "assets/logo.jpg";
  modalCat.style.display = "flex";
}

formCat.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("cat-guardar");
  btn.disabled = true; btn.textContent = "Guardando…";

  try {
    const id = document.getElementById("cat-id").value;
    const nombre = document.getElementById("cat-nombre").value.trim();
    const data = {
      nombre,
      slug: slugify(nombre),
      orden: Number(document.getElementById("cat-orden").value) || 0,
      activo: document.getElementById("cat-activo").checked,
      actualizado: serverTimestamp()
    };

    if (catImagenFile) {
      data.imagen = await subirImagen(catImagenFile, "categorias");
    }

    if (id) {
      await updateDoc(doc(db, "categorias", id), data);
    } else {
      data.creado = serverTimestamp();
      await addDoc(catCol, data);
    }

    modalCat.style.display = "none";
  } catch (err) {
    alert("No se pudo guardar la categoría: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
});

function renderCategorias() {
  const list = document.getElementById("lista-categorias");
  if (categoriasCache.length === 0) {
    list.innerHTML = `<div class="empty-state">Aún no has creado ninguna categoría.</div>`;
    return;
  }
  list.innerHTML = categoriasCache.map(cat => `
    <div class="list-row">
      <img src="${cat.imagen || 'assets/logo.jpg'}" alt="">
      <div class="info">
        <div class="name">${cat.nombre} ${cat.activo === false ? '<span style="color:var(--silver-dim)">(oculta)</span>' : ''}</div>
        <div class="meta">Orden ${cat.orden ?? 0} · /${cat.slug}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${cat.id}">Editar</button>
        <button class="icon-btn danger" data-del="${cat.id}">Eliminar</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const cat = categoriasCache.find(c => c.id === b.dataset.edit);
    abrirModalCategoria(cat);
  }));
  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("¿Eliminar esta categoría? Los artículos que tenga no se borrarán, pero quedarán huérfanos.")) return;
    await deleteDoc(doc(db, "categorias", b.dataset.del));
  }));
}

onSnapshot(query(catCol, orderBy("orden", "asc")), (snap) => {
  categoriasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCategorias();
  actualizarSelectCategorias();
});

// ==================================================
// PRODUCTOS
// ==================================================
const prodCol = collection(db, "productos");
let productosCache = [];

const modalProd = document.getElementById("modal-producto");
const formProd = document.getElementById("form-producto");
let prodImagenesExistentes = []; // URLs ya subidas (al editar)
let prodImagenesNuevas = [];     // { blob, preview } pendientes de subir

document.getElementById("btn-nuevo-producto").addEventListener("click", () => abrirModalProducto());
document.getElementById("prod-cancel").addEventListener("click", () => modalProd.style.display = "none");
document.getElementById("prod-imagen").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) abrirCrop(f, "prod");
  e.target.value = "";
});
document.getElementById("filtro-categoria").addEventListener("change", renderProductos);

function renderGaleriaProd() {
  const cont = document.getElementById("prod-galeria");
  const existentes = prodImagenesExistentes.map((url, i) => `
    <div class="foto-chip">
      <img src="${url}" alt="">
      <button type="button" class="foto-chip-x" data-tipo="existente" data-idx="${i}">×</button>
    </div>`).join("");
  const nuevas = prodImagenesNuevas.map((item, i) => `
    <div class="foto-chip">
      <img src="${item.preview}" alt="">
      <button type="button" class="foto-chip-x" data-tipo="nueva" data-idx="${i}">×</button>
    </div>`).join("");

  cont.innerHTML = (existentes + nuevas) ||
    `<span style="font-size:0.78rem; color:var(--silver-dim)">Aún no has añadido ninguna foto.</span>`;

  cont.querySelectorAll(".foto-chip-x").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.tipo === "existente") prodImagenesExistentes.splice(idx, 1);
      else prodImagenesNuevas.splice(idx, 1);
      renderGaleriaProd();
    });
  });
}

function actualizarSelectCategorias() {
  const selects = [document.getElementById("prod-categoria"), document.getElementById("filtro-categoria")];
  const opcionesBase = categoriasCache.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
  selects[0].innerHTML = opcionesBase || `<option value="">Crea una categoría primero</option>`;
  selects[1].innerHTML = `<option value="">Todas</option>` + opcionesBase;
}

function abrirModalProducto(p = null) {
  prodImagenesExistentes = p ? [...(p.imagenes && p.imagenes.length ? p.imagenes : (p.imagen ? [p.imagen] : []))] : [];
  prodImagenesNuevas = [];
  renderGaleriaProd();

  document.getElementById("modal-producto-title").textContent = p ? "Editar artículo" : "Nuevo artículo";
  document.getElementById("prod-id").value = p ? p.id : "";
  document.getElementById("prod-categoria").value = p ? p.categoriaId : (categoriasCache[0]?.id || "");
  document.getElementById("prod-nombre").value = p ? p.nombre : "";
  document.getElementById("prod-tipo").value = p ? (p.tipo || "") : "";
  document.getElementById("prod-precio").value = p ? p.precio : "";
  document.getElementById("prod-gramos").value = p && p.gramos != null ? p.gramos : "";
  document.getElementById("prod-caida").value = p ? (p.caida || "") : "";
  document.getElementById("prod-glow").checked = p ? !!p.glow : false;
  document.getElementById("prod-sonajero").checked = p ? !!p.sonajero : false;
  document.getElementById("prod-descripcion").value = p ? (p.descripcion || "") : "";
  document.getElementById("prod-orden").value = p ? p.orden ?? 0 : 0;
  document.getElementById("prod-activo").checked = p ? p.activo !== false : true;
  modalProd.style.display = "flex";
}

formProd.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("prod-guardar");
  btn.disabled = true; btn.textContent = "Guardando…";

  try {
    const id = document.getElementById("prod-id").value;
    const data = {
      categoriaId: document.getElementById("prod-categoria").value,
      nombre: document.getElementById("prod-nombre").value.trim(),
      tipo: document.getElementById("prod-tipo").value.trim(),
      precio: Number(document.getElementById("prod-precio").value) || 0,
      gramos: document.getElementById("prod-gramos").value ? Number(document.getElementById("prod-gramos").value) : null,
      caida: document.getElementById("prod-caida").value.trim(),
      glow: document.getElementById("prod-glow").checked,
      sonajero: document.getElementById("prod-sonajero").checked,
      descripcion: document.getElementById("prod-descripcion").value.trim(),
      orden: Number(document.getElementById("prod-orden").value) || 0,
      activo: document.getElementById("prod-activo").checked,
      actualizado: serverTimestamp()
    };

    if (prodImagenesNuevas.length > 0) {
      const nuevasUrls = [];
      for (const item of prodImagenesNuevas) {
        nuevasUrls.push(await subirImagen(item.blob, "productos"));
      }
      prodImagenesExistentes = [...prodImagenesExistentes, ...nuevasUrls];
      prodImagenesNuevas = [];
    }
    data.imagenes = prodImagenesExistentes;
    data.imagen = prodImagenesExistentes[0] || "";

    if (id) {
      await updateDoc(doc(db, "productos", id), data);
    } else {
      data.creado = serverTimestamp();
      await addDoc(prodCol, data);
    }

    modalProd.style.display = "none";
  } catch (err) {
    alert("No se pudo guardar el artículo: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
});

function renderProductos() {
  const list = document.getElementById("lista-productos");
  const filtro = document.getElementById("filtro-categoria").value;
  const items = filtro ? productosCache.filter(p => p.categoriaId === filtro) : productosCache;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">No hay artículos ${filtro ? "en esta categoría" : "todavía"}.</div>`;
    return;
  }

  list.innerHTML = items.map(p => {
    const cat = categoriasCache.find(c => c.id === p.categoriaId);
    const specs = [];
    if (p.gramos != null) specs.push(`${p.gramos} g`);
    if (p.caida) specs.push(`Caída ${p.caida}`);
    if (p.glow) specs.push("Glow");
    if (p.sonajero) specs.push("Sonajero");
    return `
    <div class="list-row">
      <img src="${(p.imagenes && p.imagenes[0]) || p.imagen || 'assets/logo.jpg'}" alt="">
      <div class="info">
        <div class="name">${p.nombre} ${p.activo === false ? '<span style="color:var(--silver-dim)">(oculto)</span>' : ''}</div>
        <div class="meta">${cat ? cat.nombre : "Sin categoría"} ${p.tipo ? "· " + p.tipo : ""} · ${money(p.precio)}${specs.length ? " · " + specs.join(" · ") : ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${p.id}">Editar</button>
        <button class="icon-btn danger" data-del="${p.id}">Eliminar</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const p = productosCache.find(x => x.id === b.dataset.edit);
    abrirModalProducto(p);
  }));
  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("¿Eliminar este artículo?")) return;
    await deleteDoc(doc(db, "productos", b.dataset.del));
  }));
}

onSnapshot(query(prodCol, orderBy("orden", "asc")), (snap) => {
  productosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderProductos();
});

// ==================================================
// CONTENIDO DE LA PORTADA
// ==================================================
const contenidoRef = doc(db, "sitio", "home");
const formContenido = document.getElementById("form-contenido");

async function cargarContenido() {
  try {
    const snap = await getDoc(contenidoRef);
    if (!snap.exists()) return;
    const c = snap.data();
    document.getElementById("c-hero1").value = c.heroLinea1 || "";
    document.getElementById("c-hero2").value = c.heroLinea2 || "";
    document.getElementById("c-desc").value = c.heroDescripcion || "";
    document.getElementById("c-boton").value = c.heroBoton || "";
    document.getElementById("c-cat-titulo").value = c.catTitulo || "";
    document.getElementById("c-cat-sub").value = c.catSubtitulo || "";
    document.getElementById("c-footer-izq").value = c.footerIzquierda || "";
    document.getElementById("c-footer-der").value = c.footerDerecha || "";
    document.getElementById("c-tel").value = c.contactoTelefono || "";
    document.getElementById("c-whatsapp").value = c.contactoWhatsapp || "";
    document.getElementById("c-email").value = c.contactoEmail || "";
    document.getElementById("c-insta").value = c.contactoInstagram || "";
    document.getElementById("c-tiktok").value = c.contactoTiktok || "";
  } catch (err) {
    console.error("No se pudo cargar el contenido:", err);
  }
}
cargarContenido();

formContenido.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("c-guardar");
  const aviso = document.getElementById("c-guardado");
  btn.disabled = true; btn.textContent = "Guardando…";
  aviso.textContent = "";

  try {
    await setDoc(contenidoRef, {
      heroLinea1: document.getElementById("c-hero1").value.trim(),
      heroLinea2: document.getElementById("c-hero2").value.trim(),
      heroDescripcion: document.getElementById("c-desc").value.trim(),
      heroBoton: document.getElementById("c-boton").value.trim(),
      catTitulo: document.getElementById("c-cat-titulo").value.trim(),
      catSubtitulo: document.getElementById("c-cat-sub").value.trim(),
      footerIzquierda: document.getElementById("c-footer-izq").value.trim(),
      footerDerecha: document.getElementById("c-footer-der").value.trim(),
      contactoTelefono: document.getElementById("c-tel").value.trim(),
      contactoWhatsapp: document.getElementById("c-whatsapp").value.trim(),
      contactoEmail: document.getElementById("c-email").value.trim(),
      contactoInstagram: document.getElementById("c-insta").value.trim(),
      contactoTiktok: document.getElementById("c-tiktok").value.trim(),
      actualizado: serverTimestamp()
    }, { merge: true });
    aviso.textContent = "Guardado. Ya se ve en la web pública.";
  } catch (err) {
    aviso.style.color = "var(--danger)";
    aviso.textContent = "No se pudo guardar: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Guardar cambios";
  }
});

// ==================================================
// ESTADÍSTICAS
// ==================================================
async function cargarEstadisticas() {
  try {
    const resumenSnap = await getDoc(doc(db, "estadisticas", "resumen"));
    const total = resumenSnap.exists() ? (resumenSnap.data().visitasTotal || 0) : 0;
    document.getElementById("stat-total").textContent = total;

    const diasSnap = await getDocs(collection(db, "estadisticas_dias"));
    const dias = [];
    diasSnap.forEach(d => dias.push({ fecha: d.id, visitas: d.data().visitas || 0 }));
    dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const hoy = new Date().toISOString().slice(0, 10);
    const hoyVisitas = dias.find(d => d.fecha === hoy)?.visitas || 0;
    document.getElementById("stat-hoy").textContent = hoyVisitas;

    const corte = new Date();
    corte.setDate(corte.getDate() - 6);
    const corteStr = corte.toISOString().slice(0, 10);
    const semanaVisitas = dias.filter(d => d.fecha >= corteStr).reduce((s, d) => s + d.visitas, 0);
    document.getElementById("stat-semana").textContent = semanaVisitas;

    renderGraficoVisitas(dias.slice(-14));

    const vistasCatSnap = await getDocs(collection(db, "categoria_vistas"));
    const vistasPorCat = {};
    vistasCatSnap.forEach(d => { vistasPorCat[d.id] = d.data().vistas || 0; });
    renderTopCategorias(vistasPorCat);

  } catch (err) {
    console.error("No se pudieron cargar las estadísticas:", err);
  }
}

function renderGraficoVisitas(dias) {
  const cont = document.getElementById("grafico-visitas");
  if (dias.length === 0) {
    cont.innerHTML = `<div class="empty-state" style="width:100%">Todavía no hay visitas registradas.</div>`;
    return;
  }
  const max = Math.max(...dias.map(d => d.visitas), 1);
  cont.innerHTML = dias.map(d => {
    const h = Math.max(4, Math.round((d.visitas / max) * 100));
    const label = d.fecha.slice(5).replace("-", "/");
    return `<div class="bar-col"><div class="bar" style="height:${h}%" title="${d.visitas} visitas el ${d.fecha}"></div><span>${label}</span></div>`;
  }).join("");
}

function renderTopCategorias(vistasPorCat) {
  const cont = document.getElementById("top-categorias");
  if (categoriasCache.length === 0) {
    cont.innerHTML = `<div class="empty-state">Aún no has creado categorías.</div>`;
    return;
  }
  const ordenado = [...categoriasCache]
    .map(c => ({ ...c, vistas: vistasPorCat[c.id] || 0 }))
    .sort((a, b) => b.vistas - a.vistas);

  cont.innerHTML = ordenado.map(c => `
    <div class="list-row">
      <img src="${c.imagen || 'assets/logo.jpg'}" alt="">
      <div class="info">
        <div class="name">${c.nombre}</div>
        <div class="meta">${c.vistas} visita${c.vistas === 1 ? "" : "s"}</div>
      </div>
    </div>`).join("");
}
