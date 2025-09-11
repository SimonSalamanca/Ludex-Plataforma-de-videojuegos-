// Cargar dinámicamente el submenu.html
document.addEventListener("DOMContentLoaded", () => {
    fetch("./submenu.html")
    .then(response => response.text())
    .then(data => {
        document.getElementById("submenu-container").innerHTML = data;
    })
    .catch(error => console.error("Error cargando el submenú:", error));
});
