"""Genera el SISTEMA del hotel a partir del prototipo (mismo diseño) conectado a los datos reales.

Pasos:
  1) Corre copiar_vista_previa.py (prototipo + marca del hotel).
  2) Separa ese HTML en app/sistema.css, app/sistema.js (con pruebas/datos_reales.js insertado
     antes del arranque) y app/index.html (que exige sesión con app/puente.js).
El prototipo original (prototipo/) no se toca.  Uso:  python3 pruebas/generar_sistema.py
"""
import pathlib, re, subprocess, sys

raiz = pathlib.Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, "-I", str(raiz / "pruebas" / "copiar_vista_previa.py")], check=True)
html = (raiz / "app" / "vista-previa" / "index.html").read_text(encoding="utf-8")

estilos = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
fuentes = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]+">', html).group(0)
cuerpo = html.split("<body>", 1)[1].split("<script>", 1)[0]
codigo = html.split("<script>", 1)[1].rsplit("</script>", 1)[0]
assert "<script" not in cuerpo, "El cuerpo no debe tener scripts"

marca = "/* ---------- inicio ---------- */"
assert codigo.count(marca) >= 1
datos = (raiz / "pruebas" / "datos_reales.js").read_text(encoding="utf-8")
i = codigo.rfind(marca)
codigo = codigo[:i] + datos + "\n" + codigo[i:]

aviso = ("\n/* Aviso: todavía no se guardan los cambios */\n"
         ".aviso-conexion{position:fixed;left:12px;bottom:12px;z-index:9999;max-width:min(92vw,420px);padding:10px 14px;border-radius:12px;"
         "background:#7a4a10;color:#fff;font:500 13px/1.4 var(--sans);box-shadow:0 8px 24px rgba(0,0,0,.25)}\n"
         ".aviso-conexion b{display:block;font-size:14px}.aviso-conexion a{color:#ffe2b0}\n"
         ".carga{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;font-family:var(--sans)}\n")

(raiz / "app" / "sistema.css").write_text("/* GENERADO por pruebas/generar_sistema.py desde el prototipo. No editar aquí. */\n" + estilos + aviso, encoding="utf-8")
(raiz / "app" / "sistema.js").write_text("/* GENERADO por pruebas/generar_sistema.py desde el prototipo. No editar aquí. */\n" + codigo, encoding="utf-8")
(raiz / "app" / "index.html").write_text(f"""<!doctype html>
<html lang="es">
<head>
<!-- GENERADO por pruebas/generar_sistema.py desde prototipo/Nooki-Hotel-prototipo.html. No editar aquí. -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Hotel Selva Inn · Sistema</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fuentes}
<link rel="stylesheet" href="sistema.css">
</head>
<body>{cuerpo}
<div class="aviso-conexion" id="avisoConexion" role="status"><b>Datos reales · conexión en curso</b>Lo que ves es del hotel. Los cambios hechos aquí todavía no se guardan: para guardar usa el <a href="/anterior.html">sistema anterior</a> mientras termino de conectarlo.</div>
<script src="vendor/supabase-2.117.3.js"></script>
<script src="config.js"></script>
<script src="puente.js"></script>
</body>
</html>
""", encoding="utf-8")
print("Sistema generado: app/index.html, app/sistema.css, app/sistema.js")
