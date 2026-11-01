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
html = (raiz / "pruebas" / "_generado" / "prototipo-con-marca.html").read_text(encoding="utf-8")

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

extra = ("\n/* Solo del sistema real */\n"
         ".carga{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;font-family:var(--sans)}\n"
         ".usr-lista{display:grid;gap:8px;margin:6px 0 4px}\n"
         ".usr-f{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}\n"
         ".usr-f .grow{flex:1;min-width:180px}.usr-f b{display:block}.usr-f small{color:var(--text-2);overflow-wrap:anywhere}\n"
         ".usr-acc{display:flex;gap:6px;margin-left:auto}\n"
         ".nk-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}\n")

(raiz / "app" / "sistema.css").write_text("/* GENERADO por pruebas/generar_sistema.py desde el prototipo. No editar aquí. */\n" + estilos + extra, encoding="utf-8")
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

<script src="vendor/supabase-2.117.3.js"></script>
<script src="config.js"></script>
<script src="puente.js"></script>
</body>
</html>
""", encoding="utf-8")
print("Sistema generado: app/index.html, app/sistema.css, app/sistema.js")
