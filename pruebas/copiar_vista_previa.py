"""Copia el prototipo a app/vista-previa/index.html (vista previa publicada).
Uso (desde la raíz del repo):  python3 pruebas/copiar_vista_previa.py
"""
import pathlib

raiz = pathlib.Path(__file__).resolve().parent.parent
src = (raiz / "prototipo" / "Nooki-Hotel-prototipo.html").read_text(encoding="utf-8")
assert src.count("<head>") == 1, "El prototipo debe tener un solo <head>"

aviso = ("<head>\n<!-- COPIA GENERADA de prototipo/Nooki-Hotel-prototipo.html (vista previa con datos de ejemplo). "
         "No editar aquí: editar el prototipo y volver a copiar. -->\n"
         '<meta name="robots" content="noindex, nofollow">')
out = src.replace("<head>", aviso, 1).replace("<title>Nooki Hotel", "<title>Vista previa · Nooki Hotel", 1)

destino = raiz / "app" / "vista-previa" / "index.html"
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(out, encoding="utf-8")
print("Vista previa actualizada:", destino.relative_to(raiz))
