"""Copia el prototipo con la marca del hotel a pruebas/_generado/ (paso intermedio de generar_sistema.py; no se publica)
y le pone la marca del hotel (logo, nombre, colores y letras de su web).
El prototipo original (prototipo/) no se toca.

Uso (desde la raíz del repo):  python3 pruebas/copiar_vista_previa.py
"""
import pathlib
import re

raiz = pathlib.Path(__file__).resolve().parent.parent
src = (raiz / "prototipo" / "Nooki-Hotel-prototipo.html").read_text(encoding="utf-8")
logo = (raiz / "app" / "logo.svg").read_text(encoding="utf-8")
# Logo en una línea, sin comentarios (va dentro de textos del código del prototipo)
logo_inline = re.sub(r"<!--.*?-->", "", logo).replace('role="img" aria-label="Hotel Selva Inn"', 'aria-hidden="true"')
logo_inline = " ".join(logo_inline.split())
assert "'" not in logo_inline

LOGO_PROTOTIPO = ('<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="116" fill="#2448C7"/>'
                  '<path d="M168 364 V236 a88 88 0 0 1 176 0 V364" fill="none" stroke="#FFFFFF" stroke-width="60" '
                  'stroke-linecap="round" stroke-linejoin="round"/><circle cx="282" cy="300" r="19" fill="#F5A524"/></svg>')

# Colores y letras de la web del hotel (mismos valores que app/estilos.css)
MARCA_CSS = """<style id="marca-hotel">
:root{--bg:#f7f3ed;--side:#f0eadf;--surface-2:#fbf8f3;--sunken:#efe9e0;--border:#e8e1d6;--border-2:#d9d0c2;
--text:#1c1a17;--text-2:#4d4740;--text-3:#6e665c;--grp-h:#3a2f22;
--primary:#9a5a0e;--primary-h:#7a4a10;--on-primary:#ffffff;
--accent:#9a5a0e;--accent-soft:#fbf1e2;--on-accent:#ffffff;--focus:rgba(219,142,31,.35);
--sans:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
:root[data-ui="dark"]{--bg:#12100d;--side:#16130f;--surface:#1b1814;--surface-2:#211d18;--sunken:#0f0d0b;
--border:#2e2923;--border-2:#3d362e;--text:#f1ece4;--text-2:#c2b8aa;--text-3:#9b9083;--grp-h:#eadfce;
--primary:#e9a94a;--primary-h:#f0b65c;--on-primary:#141210;
--accent:#e9a94a;--accent-soft:#2c2112;--on-accent:#141210;--focus:rgba(233,169,74,.35)}
h1{font-family:"Playfair Display",Georgia,serif;font-weight:600;letter-spacing:-.01em}
.brand b,.lock-brand b{font-family:"Playfair Display",Georgia,serif;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.brand small{color:var(--accent);text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:600}
</style>
</head>"""

CAMBIOS = [
    # cabecera: aviso, noindex y título
    ("<head>", "<head>\n<!-- COPIA GENERADA de prototipo/Nooki-Hotel-prototipo.html con la marca del hotel "
               "(vista previa con datos de ejemplo). No editar aquí: editar el prototipo y correr "
               "pruebas/copiar_vista_previa.py. -->\n<meta name=\"robots\" content=\"noindex, nofollow\">\n"
               "<link rel=\"icon\" href=\"/logo.svg\" type=\"image/svg+xml\">", 1),
    ("<title>Nooki Hotel</title>", "<title>Vista previa · Hotel Selva Inn</title>", 1),
    ("family=Geist:wght@400;500;600;700&family=Geist+Mono",
     "family=Playfair+Display:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Geist+Mono", 1),
    ("</head>", MARCA_CSS, 1),
    # logo y nombre
    (LOGO_PROTOTIPO, logo_inline, 2),
    ("<div><b>Nooki Hotel</b><small>Selva Inn · Puerto Maldonado</small></div>",
     "<div><b>Hotel Selva Inn</b><small>Puerto Maldonado · Perú</small></div>", 1),
    ("<div><b>Nooki Hotel</b><small>'+esc(CFG.name)+' · '+cap(fmtDL(TODAY))+'</small></div>",
     "<div><b>Hotel Selva Inn</b><small>'+cap(fmtDL(TODAY))+'</small></div>", 1),
    ("document.title='Nooki Hotel';", "document.title='Vista previa · Hotel Selva Inn';", 1),
    ("'Ingresar a Nooki Hotel'", "'Ingresar a Hotel Selva Inn'", 1),
    # Excel: sin la marca del sistema
    ("' · Nooki Hotel&amp;RPágina", "'&amp;RPágina", 1),
    ("a las '+nowHM()+' con Nooki Hotel'", "a las '+nowHM()", 1),
    ("<dc:creator>Nooki Hotel</dc:creator>", "<dc:creator>Hotel Selva Inn</dc:creator>", 1),
    ("local de Nooki Hotel guarda", "local del sistema guarda", 1),
    # datos públicos del hotel (de su web)
    ("var CFG={name:'Selva Inn',legal:'',ruc:'',addr:'Puerto Maldonado · Madre de Dios',phone:'',mail:''",
     "var CFG={name:'Hotel Selva Inn',legal:'',ruc:'',addr:'Jr. 28 de Julio 541, Puerto Maldonado',"
     "phone:'+51 946 895 818',mail:'info@hotelselvainn.com'", 1),
]

out = src
for viejo, nuevo, veces in CAMBIOS:
    hay = out.count(viejo)
    assert hay == veces, f"Se esperaba {veces} vez/veces y hay {hay}: {viejo[:70]}"
    out = out.replace(viejo, nuevo)
assert "Nooki Hotel" not in out, "Quedó 'Nooki Hotel' en la vista previa"

destino = raiz / "pruebas" / "_generado" / "prototipo-con-marca.html"   # paso intermedio (no se publica)
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(out, encoding="utf-8")
print("Prototipo con la marca del hotel:", destino.relative_to(raiz))
