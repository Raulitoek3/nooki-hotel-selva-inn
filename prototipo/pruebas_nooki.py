import asyncio, sys, re
from playwright.async_api import async_playwright
import os
SRC=os.environ.get('NOOKI_SRC','/tmp/claude-0/-home-claude/ee5673d4-b08f-5bf3-b444-e29f6102545a/scratchpad/nooki/Nooki-Hotel-prototipo.html')
OUT=os.environ.get('NOOKI_OUT','/tmp/claude-0/-home-claude/ee5673d4-b08f-5bf3-b444-e29f6102545a/scratchpad/nooki/shots/')
VIEWS=['inicio','panel','timeline','nueva','limpieza','cierre','reservas','restaurante','whatsapp','ventas','caja','productos','almacen','clientes','reportes','impresion','ajustes','auditoria']
results=[]
def ok(name,cond,info=''):
    results.append((('PASS' if cond else 'FAIL'),name,info))

async def main():
    import os; os.makedirs(OUT,exist_ok=True)
    body=open(SRC).read()
    html=body if body.lstrip().lower().startswith('<!doctype') else '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'+body+'</body></html>'
    async with async_playwright() as p:
        b=await p.chromium.launch(ignore_default_args=['--hide-scrollbars'])
        ctx=await b.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
        pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.set_content(html, wait_until='load'); await pg.wait_for_timeout(700)
        async def login(pg_,name='Ana',pin='1234'):
            await pg_.click(f'.lu:has-text("{name}")'); await pg_.wait_for_timeout(200)
            await pg_.keyboard.type(pin); await pg_.wait_for_timeout(500)
        # 0 sin pantalla de ingreso: la PC de recepción abre directo
        ok('abre directo, sin ingreso', await pg.locator('#lock:not([hidden])').count()==0 and await pg.locator('.lu').count()==0)
        ok('perfil de recepción', 'Recepción' in await pg.inner_text('.me'))
        async def go(v):
            await pg.evaluate(f"location.hash='{v}'"); await pg.wait_for_timeout(450)
        async def txt(sel='#view'):
            return await pg.inner_text(sel)
        async def step(name,coro):
            n=len(errs)
            try:
                await coro()
            except Exception as e:
                ok(name,False,'EXC '+str(e).split('\n')[0][:200]); return
            if len(errs)>n: ok(name+' (js errors)',False,' | '.join(errs[n:])[:300])
        async def close_dw():
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(450)

        # 1 todas las vistas cargan
        for v in VIEWS:
            n=len(errs)
            await go(v)
            t=await txt()
            ok('vista '+v, len(t)>40 and len(errs)==n, (' | '.join(errs[n:]))[:200])
            await pg.screenshot(path=OUT+'d_'+v+'.png')
        await go('panel')
        ok('panel 35 habitaciones', await pg.locator('.room').count()==35)

        # 1d agregar habitaciones y tipos (Ajustes, con clave)
        async def t_hab():
            await go('ajustes')
            if await pg.locator('#admPin').count():
                await pg.fill('#admPin','1234'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="set"][data-v="tarifas"]'); await pg.wait_for_timeout(300)
            ok('habitaciones agrupadas por piso', await pg.locator('.hb').count()==35 and await pg.locator('.hb-ph:has-text("Piso 4")').count()==1)
            # tipo nuevo
            await pg.click('[data-act="tipo-add"]'); await pg.wait_for_timeout(300)
            await pg.fill('#tpN','Suite familiar'); await pg.fill('#tpC','4'); await pg.fill('#tpB','2'); await pg.fill('#tpR','350'); await pg.click('#tpGo'); await pg.wait_for_timeout(350)
            ok('tipo nuevo agregado', 'Suite familiar' in await txt())
            # una habitación
            await pg.click('[data-act="hab-add"]'); await pg.wait_for_timeout(300)
            await pg.fill('#hbN','501'); await pg.fill('#hbF','5')
            await pg.click('[data-sel="hb-t"]'); await pg.wait_for_timeout(200); await pg.click('.pop .mi:has-text("Suite familiar") >> nth=0'); await pg.wait_for_timeout(200)
            await pg.click('#hbGo'); await pg.wait_for_timeout(350)
            ok('habitación agregada', await pg.locator('.hb:has-text("501")').count()==1 and 'Piso 5' in await txt())
            # varias seguidas
            await pg.click('[data-act="hab-add"]'); await pg.wait_for_timeout(300)
            await pg.fill('#hbN','502'); await pg.fill('#hbH','505'); await pg.fill('#hbF','5'); await pg.click('#hbGo'); await pg.wait_for_timeout(350)
            ok('varias habitaciones de una vez', await pg.evaluate('NK.rooms()')==40, str(await pg.evaluate('NK.rooms()')))
            # repetida
            await pg.click('[data-act="hab-add"]'); await pg.wait_for_timeout(300)
            await pg.fill('#hbN','101'); await pg.click('#hbGo'); await pg.wait_for_timeout(250)
            ok('no deja repetir número', 'Ya existe la habitación 101' in await pg.inner_text('#hbE'))
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=OUT+'d_habitaciones.png')
            # editar y eliminar
            await pg.click('[data-act="hab-edit"][data-room="505"]'); await pg.wait_for_timeout(300)
            await pg.fill('#hbN','510'); await pg.click('#hbGo'); await pg.wait_for_timeout(350)
            ok('cambiar número de habitación nueva', await pg.locator('[data-act="hab-edit"][data-room="510"]').count()==1)
            await pg.click('[data-act="hab-edit"][data-room="510"]'); await pg.wait_for_timeout(300); await pg.click('#hbDel'); await pg.wait_for_timeout(350)
            ok('eliminar habitación sin reservas', await pg.evaluate('NK.rooms()')==39)
            await pg.click('[data-act="hab-edit"][data-room="101"]'); await pg.wait_for_timeout(300)
            ok('con reservas no se cambia el número', await pg.locator('#hbN[disabled]').count()==1)
            await pg.click('#hbDel'); await pg.wait_for_timeout(250)
            ok('con reservas no se elimina', 'No se puede eliminar' in await pg.inner_text('#hbE') or 'historial' in await pg.inner_text('#hbE'))
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            # aparece en el panel y en la nueva reserva
            await go('panel')
            ok('panel muestra las nuevas', await pg.locator('.room').count()==39 and await pg.locator('.floor-h h2:has-text("Piso 5")').count()==1)
            await go('timeline'); ok('timeline muestra las nuevas', '501' in await txt())
            # se quitan para no cambiar las demás pruebas
            await pg.evaluate("NK.quitar(['501','502','503','504'])")
            await go('panel'); ok('vuelve a 35', await pg.locator('.room').count()==35)
            await pg.evaluate('NK.adm.hasta=0')
        await step('agregar habitaciones',t_hab)

        # 1b clave de administrador
        async def t_clave():
            await go('ajustes')
            ok('ajustes pide la clave', await pg.locator('#admPin').count()==1 and 'Empresa' not in await txt())
            await pg.fill('#admPin','0000'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(250)
            ok('clave equivocada avisa', 'incorrecta' in await pg.inner_text('#admE') and await pg.locator('#admPin').count()==1)
            await pg.screenshot(path=OUT+'d_clave_ajustes.png')
            await pg.fill('#admPin','1234'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(350)
            ok('clave correcta abre ajustes', await pg.locator('.set-nav').count()==1)
            ok('aviso de modo administrador', await pg.is_visible('#admChip'))
            await pg.click('[data-act="adm-lock"]'); await pg.wait_for_timeout(350)
            ok('bloquear cierra ajustes', await pg.locator('#admPin').count()==1 and not await pg.is_visible('#admChip'))
            # anular comprobante pide clave
            await go('ventas'); await pg.click('.vrow:has(.pill:has-text("Aceptado")) >> nth=0'); await pg.wait_for_timeout(500)
            await pg.click('#dwIn [data-act="doc-void"]'); await pg.wait_for_timeout(300)
            ok('anular comprobante pide la clave', await pg.locator('#admPin2').count()==1 and await pg.locator('#vdM').count()==0)
            await pg.screenshot(path=OUT+'d_clave_modal.png')
            await pg.fill('#admPin2','1234'); await pg.press('#admPin2','Enter'); await pg.wait_for_timeout(350)
            ok('con la clave sigue a anular', await pg.locator('#vdM').count()==1)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click('#dwIn [data-act="doc-nc"]') if await pg.locator('#dwIn [data-act="doc-nc"]').count() else None
            await pg.wait_for_timeout(300)
            ok('nota de crédito no vuelve a pedir clave', await pg.locator('#admPin2').count()==0)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await close_dw()
            # anular reserva y cambiar precio piden clave (con modo bloqueado)
            await pg.evaluate("NK.adm.hasta=0")
            await pg.evaluate("NK.anular(NK.res.find(function(r){return r.state==='reservado'||r.state==='confirmado';}))"); await pg.wait_for_timeout(300)
            ok('anular reserva pide la clave', await pg.locator('#admPin2').count()==1)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await go('panel'); await pg.click('[data-act="new-res"] >> nth=0'); await pg.wait_for_timeout(500)
            await pg.click('#nrRooms .rp:not([disabled]) >> nth=0'); await pg.wait_for_timeout(300)
            if await pg.locator('[data-rp]').count():
                await pg.locator('[data-rp]').first.focus(); await pg.wait_for_timeout(300)
                ok('cambiar precio pide la clave', await pg.locator('#admPin2').count()==1)
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            else:
                ok('cambiar precio pide la clave', False, 'no hay campo de precio')
            # cinco intentos equivocados bloquean
            await go('auditoria')
            for _ in range(5):
                await pg.fill('#admPin','9999'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(120)
            ok('cinco intentos bloquean 1 minuto', 'Espera' in await pg.inner_text('#admE'))
            await pg.fill('#admPin','1234'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(250)
            ok('durante la espera ni la buena entra', await pg.locator('#admPin').count()==1)
            await pg.evaluate("NK.adm.esperaHasta=0")
            await pg.fill('#admPin','1234'); await pg.press('#admPin','Enter'); await pg.wait_for_timeout(350)
            ok('después de la espera entra', await pg.locator('#auList').count()==1)
            await pg.evaluate("NK.adm.MIN=600;NK.renovar()")
        await step('clave de administrador',t_clave)

        # 1c auditoría
        async def t_aud():
            await go('auditoria'); t=await txt()
            ok('auditoría registra la clave', 'Clave de administrador correcta' in t and 'incorrecta' in t)
            ok('auditoría registra el bloqueo', 'bloqueado 1 minuto' in t)
            ok('auditoría con fecha y hora', bool(re.search(r'\d+ oct · \d\d:\d\d', t)))
            await pg.screenshot(path=OUT+'d_auditoria.png')
            await pg.click('[data-act="au-per"][data-v="7d"]'); await pg.wait_for_timeout(250)
            n7=await pg.locator('#auList .lt-r').count()
            ok('historia de días anteriores', n7>20, str(n7))
            await pg.fill('#auSearch','Check-in'); await pg.wait_for_timeout(300)
            rows=await pg.locator('#auList .lt-r').all_inner_texts()
            ok('buscar en la auditoría', len(rows)>0 and all('check-in' in r.lower() for r in rows), str(len(rows)))
            await pg.fill('#auSearch',''); await pg.wait_for_timeout(250)
            await pg.click('[data-act="au-niv"][data-v="alerta"] >> nth=0'); await pg.wait_for_timeout(250)
            rows=await pg.locator('#auList .lt-r').all_inner_texts()
            ok('filtro de alertas', len(rows)>0 and all('Alerta' in r for r in rows))
            await pg.click('[data-act="au-niv"][data-v="alerta"] >> nth=0'); await pg.wait_for_timeout(250)
            # un movimiento nuevo aparece
            await go('caja'); await pg.evaluate("NK.toast('Movimiento de prueba 777')"); await go('auditoria')
            await pg.click('[data-act="au-per"][data-v="hoy"]'); await pg.wait_for_timeout(250)
            ok('movimiento nuevo con su módulo', 'Movimiento de prueba 777' in await txt() and 'Caja' in (await pg.locator('#auList .lt-r:has-text("777")').inner_text()))
            # cambiar la clave
            await go('ajustes'); await pg.click('[data-act="set"][data-v="seguridad"]'); await pg.wait_for_timeout(300)
            await pg.fill('#scA','1111'); await pg.fill('#scN','5678'); await pg.fill('#scR','5678'); await pg.click('[data-act="adm-save"]'); await pg.wait_for_timeout(250)
            ok('cambiar clave exige la actual', 'actual no es correcta' in await pg.inner_text('#scE'))
            await pg.fill('#scA','1234'); await pg.fill('#scN','5678'); await pg.fill('#scR','5678'); await pg.click('[data-act="adm-save"]'); await pg.wait_for_timeout(300)
            ok('clave cambiada', await pg.evaluate("NK.adm.clave")=='5678')
            await pg.screenshot(path=OUT+'d_seguridad.png')
            await pg.evaluate("NK.adm.clave='1234'")
        await step('auditoría',t_aud)

        # 2 abrir caja
        async def t_caja_open():
            await go('caja'); await pg.fill('#cajaAmt','200'); await pg.click('[data-act="caja-open-page"]'); await pg.wait_for_timeout(300)
            ok('caja abierta', 'on' in (await pg.get_attribute('#cajaBtn','class') or ''))
        await step('abrir caja',t_caja_open)

        # 3 consumo + cobro + check-out en 101
        async def t_checkout():
            await go('panel'); await pg.click('.room[data-room="101"]'); await pg.wait_for_timeout(600)
            ok('drawer 101 abierto', await pg.locator('#dw.open').count()==1)
            await pg.click('#dwIn [data-act="add-item"]'); await pg.wait_for_timeout(250)
            await pg.click('.pop .mi:not([disabled]) >> nth=0'); await pg.wait_for_timeout(350)
            lines=await pg.locator('#dwIn .line').count(); ok('consumo agregado', lines>=2, str(lines))
            await pg.click('#dwIn .dw-f [data-act="pay"]'); await pg.wait_for_timeout(350)
            await pg.click('#payGo'); await pg.wait_for_timeout(500)
            ok('pago registrado', 'emitida' in await txt('#toasts'))
            await pg.click('#dwIn [data-act="checkout"]'); await pg.wait_for_timeout(700)
            t=await pg.inner_text('.room[data-room="101"]'); ok('101 pasa a limpieza','Limpieza' in t, t[:80])
        await step('check-out',t_checkout)

        async def t_caja_mov():
            await go('caja'); t=await txt(); ok('cobro efectivo en caja','Cobro de hospedaje' in t)
        await step('caja movimientos',t_caja_mov)

        # 4 nueva reserva
        async def t_new():
            await go('panel'); await pg.click('[data-act="new-res"] >> nth=0'); await pg.wait_for_timeout(500)
            await pg.click('#cliQ'); await pg.type('#cliQ','a'); await pg.wait_for_timeout(300)
            await pg.click('.pop .mi.cli >> nth=0'); await pg.wait_for_timeout(300)
            await pg.click('#nrRooms .rp:not([disabled]) >> nth=0'); await pg.wait_for_timeout(300)
            ok('habitación elegida con un toque', await pg.locator('#nrSum .sum-r').count()==1)
            await pg.click('#nrRooms [data-act="f-nights"][data-d="1"]'); await pg.wait_for_timeout(200)
            ok('noches +1', '2 noches' in await txt('#nrSum'))
            await pg.click('#nrSum [data-act="form-save"]'); await pg.wait_for_timeout(900)
            ok('reserva guardada','guardada' in await txt('#toasts'))
            ok('reserva abre su panel', await pg.locator('#dw.open').count()==1)
            await close_dw()
        await step('nueva reserva',t_new)

        # 4b validacion
        async def t_valid():
            await go('nueva'); await pg.click('#nrSum [data-act="form-save"]'); await pg.wait_for_timeout(400)
            ok('validación marca errores', await pg.locator('.err-b, .ferr').count()>=2)
        await step('validación',t_valid)


        # 4c todo en una pantalla
        async def t_fit():
            for w,h in [(1440,900),(1366,768),(1920,1080)]:
                await pg.set_viewport_size({'width':w,'height':h}); await pg.wait_for_timeout(300)
                for v in ['nueva','timeline']:
                    await go(v); await pg.wait_for_timeout(250)
                    m=await pg.evaluate("(()=>{var m=document.getElementById('mainScroll');var o=[...document.querySelectorAll('.nrc')].filter(c=>c.scrollHeight>c.clientHeight+2&&!c.querySelector('.rpick,.sum-l')).map(c=>c.id);var sc=document.getElementById('tlScroll');return {page:m.scrollHeight-m.clientHeight,cards:o,tlv:sc?sc.scrollHeight-sc.clientHeight:0,tlh:sc?sc.scrollWidth-sc.clientWidth:0}})()")
                    if v=='timeline': m['rh']=await pg.evaluate("parseFloat(document.getElementById('tlGrid').style.getPropertyValue('--rh'))"); m['cw']=await pg.evaluate("parseFloat(document.getElementById('tlGrid').style.getPropertyValue('--cw'))")
                    good=m['page']<=2 and not m['cards'] and (v!='timeline' or (m['rh']>=56 and m['cw']>=56))
                    ok(f'{v} sin scroll de página {w}x{h}', good, str(m))
                    await pg.screenshot(path=OUT+f'fit_{v}_{w}.png')
            await pg.set_viewport_size({'width':1440,'height':900}); await pg.wait_for_timeout(300)
            # el globito de notificaciones no se corta
            clip=await pg.evaluate("(()=>{var r=[];document.querySelectorAll('.ni .bd:not(:empty)').forEach(b=>{var a=b.getBoundingClientRect(),n=document.querySelector('.nav').getBoundingClientRect();if(a.right>n.right-1||a.width<20)r.push(b.dataset.bd+':'+a.right+'/'+n.right)});return r})()")
            ok('globitos del menú completos', not clip, str(clip))
            # menu compacto
            await pg.click('#menuBtn'); await pg.wait_for_timeout(450)
            ok('menú compacto', await pg.evaluate("document.querySelector('.app').classList.contains('rail')"))
            await go('timeline'); await pg.screenshot(path=OUT+'rail_timeline.png')
            await pg.click('#menuBtn'); await pg.wait_for_timeout(450)
            # tocar un espacio libre en el timeline
            await go('timeline')
            pos=await pg.evaluate("(()=>{for(const c of document.querySelectorAll('.tl-cells[data-room]')){const rn=c.dataset.room;if(rn==='AUD')continue;const b=c.getBoundingClientRect(),cw=b.width/31,S=document.getElementById('tlScroll').getBoundingClientRect();for(let d=17;d<=30;d++){const x=b.left+(d-0.5)*cw,y=b.top+b.height/2;if(x<S.left+230||x>S.right-130||y<S.top+70||y>S.bottom-20)continue;const el=document.elementFromPoint(x,y);if(el&&el.classList.contains('tl-cells'))return {x,y,rn,d}}}return null})()")
            ok('hay espacio libre en timeline', pos is not None)
            if pos:
                await pg.mouse.move(pos['x'],pos['y']); await pg.wait_for_timeout(150)
                ok('vista previa al pasar', await pg.locator('.tl-ghost').count()==1)
                await pg.mouse.click(pos['x'],pos['y']); await pg.wait_for_timeout(500)
                ok('toque abre nueva reserva con la habitación', await pg.evaluate('location.hash')=='#nueva' and await pg.locator(f'#nrRooms .rp.on[data-room="{pos["rn"]}"]').count()==1, str(pos))
            await pg.evaluate('location.hash="panel"'); await pg.wait_for_timeout(400)
        await step('una pantalla',t_fit)

        # 5 restaurante
        async def t_rest():
            await go('restaurante'); await pg.click('.mesa[data-id="S1"]'); await pg.wait_for_timeout(500)
            await pg.click('#dwIn [data-act="r-open"]'); await pg.wait_for_timeout(300)
            await pg.click('#dwIn .pbtn:not([disabled]) >> nth=0'); await pg.wait_for_timeout(250)
            await pg.click('#dwIn .pbtn:not([disabled]) >> nth=0'); await pg.wait_for_timeout(250)
            ok('pedido con productos', await pg.locator('#dwIn .line').count()>=1)
            await pg.click('#dwIn [data-act="r-send"]'); await pg.wait_for_timeout(300)
            ok('comanda enviada','Comanda enviada' in await txt('#toasts'))
            await pg.click('#dwIn [data-act="r-more"]'); await pg.wait_for_timeout(250)
            await pg.click('.pop .mi >> nth=0'); await pg.wait_for_timeout(300)
            await pg.click('#rrGo'); await pg.wait_for_timeout(500)
            ok('cargado a habitación','Cargado' in await txt('#toasts'))
            await pg.click('.mesa[data-id="S3"]'); await pg.wait_for_timeout(500)
            await pg.click('#dwIn [data-act="r-pay"]'); await pg.wait_for_timeout(300)
            await pg.click('#rpGo'); await pg.wait_for_timeout(600)
            ok('venta de mesa emitida','liberada' in await txt('#toasts'))
            ok('mesa S3 libre','Libre' in await pg.inner_text('.mesa[data-id="S3"]'))
        await step('restaurante',t_rest)

        # 6 whatsapp
        async def t_wa():
            await go('whatsapp'); n0=await pg.locator('[data-act="wa-ok"]').count()
            await pg.click('[data-act="wa-ok"] >> nth=0'); await pg.wait_for_timeout(300)
            await pg.click('#waGo'); await pg.wait_for_timeout(600)
            n1=await pg.locator('[data-act="wa-ok"]').count(); ok('pedido confirmado', n1==n0-1, f'{n0}->{n1}')
            await pg.click('[data-act="wa-no"] >> nth=0'); await pg.wait_for_timeout(300); await pg.click('#wnGo'); await pg.wait_for_timeout(400)
            ok('pedido rechazado','rechazado' in await txt('#toasts'))
        await step('whatsapp',t_wa)

        # 7 productos
        async def t_prod():
            await go('productos'); await pg.click('[data-act="prod-new"]'); await pg.wait_for_timeout(300)
            await pg.fill('#pdN','Jugo de cocona'); await pg.fill('#pdP','8'); await pg.fill('#pdS','10'); await pg.click('#pdGo'); await pg.wait_for_timeout(400)
            ok('producto creado','Jugo de cocona' in await txt())
            await pg.fill('#prSearch','cocona'); await pg.wait_for_timeout(700)
            ok('búsqueda de productos', await pg.locator('#prList .lt-r').count()==1)
            await pg.click('#prSearch'); await pg.keyboard.type('x'); await pg.wait_for_timeout(200); ok('búsqueda mantiene foco', await pg.evaluate("document.activeElement.id")=='prSearch'); await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(200)
        await step('productos',t_prod)

        # 8 almacen
        async def t_alm():
            await go('almacen'); await pg.click('.head-actions [data-act="alm-in"]'); await pg.wait_for_timeout(300)
            await pg.fill('#amQ','12'); await pg.click('#amGo'); await pg.wait_for_timeout(400)
            ok('entrada almacén','Entrada registrada' in await txt('#toasts'))
            await pg.click('[data-act="alm-out"]'); await pg.wait_for_timeout(300); await pg.fill('#amQ','99999'); await pg.click('#amGo'); await pg.wait_for_timeout(200)
            ok('salida valida stock', not await pg.locator('#amE').is_hidden()); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)
            await pg.click('[data-act="a-tab"][data-v="mov"]'); await pg.wait_for_timeout(300)
            ok('movimientos con guía','Guía G-00' in await txt())
            await pg.click('[data-act="a-f"][data-v="vence"]'); await pg.wait_for_timeout(300)
            ok('filtro por vencer','Vence en' in await txt())
        await step('almacén',t_alm)

        # 9 clientes
        async def t_cli():
            await go('clientes'); await pg.click('#cList .lt-r >> nth=0'); await pg.wait_for_timeout(500)
            await pg.click('#dwIn [data-act="cli-no"]'); await pg.wait_for_timeout(300); await pg.fill('#ngM','Prueba de no grato'); await pg.click('#ngGo'); await pg.wait_for_timeout(500)
            ok('cliente no grato','Cliente no grato' in await txt('#dwIn'))
            await pg.click('#dwIn [data-act="cli-res"]'); await pg.wait_for_timeout(500)
            ok('reserva desde cliente avisa no grato','Cliente no grato' in await txt())
            await go('clientes'); await pg.click('[data-act="cli-new"]'); await pg.wait_for_timeout(300)
            await pg.fill('#pfDoc','12345678'); await pg.fill('#pfName','juan pérez soto'); await pg.click('#pfGo'); await pg.wait_for_timeout(400)
            await pg.fill('#cSearch','12345678'); await pg.wait_for_timeout(300)
            ok('cliente nuevo encontrado','Juan Pérez Soto' in await txt('#cList'))
        await step('clientes',t_cli)

        # 10 reportes
        async def t_rep():
            await go('reportes'); keys=['comprobantes','ocupacion','origen','huespedes','mincetur','caja','categoria','metodo','stock']
            good=True
            for k in keys:
                await pg.click(f'[data-act="rep"][data-k="{k}"]'); await pg.wait_for_timeout(250)
                rows=await pg.locator('.rep.open .rtable tbody tr').count(); good=good and rows>=1
            ok('reportes con filas',good)
        await step('reportes',t_rep)

        async def t_rep2():
            import openpyxl
            await go('reportes')
            if await pg.locator('.rep.open').count(): await pg.click('.rep.open [data-act="rep"]'); await pg.wait_for_timeout(200)
            await pg.click('[data-act="rep"][data-k="comprobantes"]'); await pg.wait_for_timeout(250)
            n_hoy=await pg.locator('.rep.open tbody tr').count()
            await pg.click('[data-act="rp-per"][data-k="comprobantes"][data-v="mes"]'); await pg.wait_for_timeout(250)
            n_mes=await pg.locator('.rep.open tbody tr').count()
            ok('reporte: el período cambia las filas', n_mes>n_hoy, f'{n_hoy}/{n_mes}')
            await pg.click('[data-act="rp-per"][data-k="comprobantes"][data-v="rango"]'); await pg.wait_for_timeout(250)
            await pg.fill('[data-rd="a"]','2026-10-12'); await pg.dispatch_event('[data-rd="a"]','change'); await pg.wait_for_timeout(200)
            await pg.fill('[data-rd="b"]','2026-10-13'); await pg.dispatch_event('[data-rd="b"]','change'); await pg.wait_for_timeout(250)
            ok('reporte: fechas elegidas', '12/10/2026 al 13/10/2026' in await pg.inner_text('.rep.open .rp-per-t'))
            fechas=await pg.locator('.rep.open tbody tr td:first-child').all_inner_texts()
            ok('reporte: solo esas fechas', len(fechas)>0 and all(f in ('12 oct','13 oct') for f in fechas), str(set(fechas)))
            await pg.click('[data-sel="rf-comprobantes-tipo"]'); await pg.wait_for_timeout(200); await pg.click('.pop .mi:has-text("Factura") >> nth=0'); await pg.wait_for_timeout(250)
            tipos=await pg.locator('.rep.open tbody tr td:nth-child(3)').all_inner_texts()
            ok('reporte: filtro por tipo', len(tipos)>0 and all(t=='Factura' for t in tipos), str(set(tipos)))
            ok('reporte: fila de total', await pg.locator('.rep.open tfoot td:has-text("Total")').count()==1 or len(tipos)==1)
            await pg.screenshot(path=OUT+'d_reporte_filtros.png')
            async with pg.expect_download() as dl:
                await pg.click('.rep.open [data-act="rep-xls"]')
            d=await dl.value; path=OUT+'reporte.xlsx'; await d.save_as(path)
            ok('excel: nombre con fechas', d.suggested_filename.endswith('2026-10-12_al_2026-10-13.xlsx'), d.suggested_filename)
            wb=openpyxl.load_workbook(path); ws=wb.active
            ok('excel: título y período', 'Comprobantes emitidos' in str(ws['A1'].value) and '12/10/2026 al 13/10/2026' in str(ws['A2'].value) and 'Factura' in str(ws['A2'].value))
            ok('excel: encabezado con color y fijo', ws['A5'].value=='Fecha' and ws['A5'].fill.fgColor.rgb=='FF1E3A8A' and ws.freeze_panes=='A6' and ws.auto_filter.ref and ws.auto_filter.ref.startswith('A5'))
            ok('excel: números reales', isinstance(ws['I6'].value,(int,float)) and 'S/' in ws['I6'].number_format and ws['A6'].is_date)
            last=[c.value for c in ws[ws.max_row-2]]
            ok('excel: total con fórmula', last[0]=='Total' and str(last[8]).startswith('=SUBTOTAL(9,I6:'), str(last))
            async with pg.expect_download() as dl:
                await pg.click('[data-act="rep-xls-all"]')
            d=await dl.value; await d.save_as(OUT+'todos.xlsx')
            wb=openpyxl.load_workbook(OUT+'todos.xlsx')
            ok('excel: todos los reportes, una hoja cada uno', len(wb.sheetnames)==9 and 'Reporte MINCETUR' in wb.sheetnames, str(wb.sheetnames))
            await pg.click('.rep.open [data-act="rep"]'); await pg.wait_for_timeout(200)
            await pg.click('[data-act="rep"][data-k="stock"]'); await pg.wait_for_timeout(250)
            ok('stock sin período', await pg.locator('.rep.open [data-act="rp-per"]').count()==0)
            await pg.click('[data-sel="rf-stock-st"]'); await pg.wait_for_timeout(200); await pg.click('.pop .mi:has-text("Solo stock bajo") >> nth=0'); await pg.wait_for_timeout(250)
            est=await pg.locator('.rep.open tbody tr td:last-child').all_inner_texts()
            ok('stock: solo bajo', all(e!='Stock bien' for e in est), str(set(est)))
        await step('reportes con filtros y excel',t_rep2)

        # 11 impresion
        async def t_prn():
            await go('impresion'); await pg.click('[data-act="prn-test"][data-id="BARRA"]'); await pg.wait_for_timeout(1500)
            ok('impresora sin conexión da error','No se pudo imprimir' in await txt('#toasts'))
            await pg.click('[data-act="prn-toggle"][data-id="BARRA"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="prn-test"][data-id="BARRA"]'); await pg.wait_for_timeout(1500)
            t=await txt(); ok('historial con comandas','Comanda' in t and 'Página de prueba' in t)
        await step('impresión',t_prn)

        # 12 ajustes
        async def t_set():
            await go('ajustes'); await pg.click('[data-act="set"][data-v="sunat"]'); await pg.wait_for_timeout(300)
            await pg.fill('#cfIgv','18'); await pg.click('[data-act="cfg-save"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="set"][data-v="tarifas"]'); await pg.wait_for_timeout(300)
            await pg.fill('[data-rate="P"]','175'); await pg.click('[data-act="cfg-save"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="set"][data-v="horarios"]'); await pg.wait_for_timeout(300)
            await pg.fill('#cfCi','14:00'); await pg.click('[data-act="cfg-save"]'); await pg.wait_for_timeout(300)
            await go('panel'); ok('horario nuevo en panel','check-in 14:00' in await txt())
            await pg.click('[data-act="set"]') if False else None
            await go('ventas'); ok('IGV nuevo en ventas','IGV 18%' in await txt())
            await go('ajustes'); await pg.click('[data-act="set"][data-v="pagos"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="pay-sw"][data-m="Cheque"]'); await pg.wait_for_timeout(200)
            ok('forma de pago desactivada','Oculto' in await txt())
        await step('ajustes',t_set)

        # 13 ventas anular
        async def t_void():
            await go('ventas'); await pg.click('.vrow:has(.pill:has-text("Aceptado")) >> nth=0'); await pg.wait_for_timeout(500)
            ok('comprobante con IGV 18', 'IGV 18%' in await txt('#dwIn'))
            await pg.click('#dwIn [data-act="doc-void"]'); await pg.wait_for_timeout(300); await pg.fill('#vdM','Prueba'); await pg.click('#vdGo'); await pg.wait_for_timeout(500)
            ok('comprobante anulado','ANULADO' in (await txt('#dwIn')).upper())
            await close_dw()
        await step('ventas',t_void)

        # 14 cerrar caja
        async def t_close():
            await go('caja'); await pg.click('[data-act="caja-close"]'); await pg.wait_for_timeout(300)
            await pg.fill('#ccAmt','1'); await pg.wait_for_timeout(100)
            ok('arqueo muestra faltante','Falta' in await txt('#ccDiff'))
            await pg.click('#ccGo'); await pg.wait_for_timeout(500)
            ok('turno registrado','Día 210' in await txt())
        await step('cerrar caja',t_close)


        # 16 limpieza
        async def t_hk():
            await go('limpieza')
            n0=await pg.locator('.hk-col.st-out .hkc:not(.ghost)').count()
            await pg.click('.hk-col.st-out [data-act="hk-start"] >> nth=0'); await pg.wait_for_timeout(250)
            await pg.click('.pop .mi >> nth=0'); await pg.wait_for_timeout(400)
            ok('limpieza empieza con camarera', await pg.locator('.hk-col.st-clean .hkc').count()>=2, str(n0))
            await pg.click('.hk-col.st-clean [data-act="hk-done"] >> nth=0'); await pg.wait_for_timeout(300)
            ok('pasa a revisión', await pg.locator('.hk-col.st-conf .hkc').count()==1)
            await pg.click('.hk-col.st-conf [data-act="hk-ok"]'); await pg.wait_for_timeout(300)
            ok('aprobada y lista', 'lista para vender' in await txt('#toasts'))
            await pg.click('[data-act="rep-st"][data-v="hecho"] >> nth=0'); await pg.wait_for_timeout(250)
            ok('repaso marcado', await pg.locator('.rp-t2.st-ok').count()>=1)
            await pg.screenshot(path=OUT+'d_limpieza_after.png')
        await step('limpieza',t_hk)

        # 17 temporadas
        async def t_ss():
            await go('nueva')
            await pg.fill('#fCi','2026-10-30'); await pg.dispatch_event('#fCi','change'); await pg.wait_for_timeout(300)
            tb=await pg.inner_text('.tarifa-box'); hdr=await pg.inner_text('.rp-t >> nth=0')
            await pg.fill('#fCi','2026-10-20'); await pg.dispatch_event('#fCi','change'); await pg.wait_for_timeout(300)
            hdr2=await pg.inner_text('.rp-t >> nth=0'); tb2=await pg.inner_text('.tarifa-box')
            num=lambda x: float(x.split('S/')[1].split('·')[0].replace(',','').strip())
            ok('tarifa de feriado automática', 'Feriado' in tb and 'Regular' in tb2 and abs(num(hdr)-round(num(hdr2)*1.15))<=1, tb+' | '+hdr+' | '+hdr2)
            await pg.fill('#fCi','2026-10-30'); await pg.dispatch_event('#fCi','change'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=OUT+'nr_feriado.png')
            await go('ajustes'); await pg.click('[data-act="set"][data-v="temporadas"]'); await pg.wait_for_timeout(300)
            n=await pg.locator('.set-b .lt-r').count()
            await pg.click('[data-act="ss-add"]'); await pg.wait_for_timeout(250)
            await pg.fill('#ssN','Semana de prueba'); await pg.click('#ssGo'); await pg.wait_for_timeout(300)
            ok('temporada agregada', await pg.locator('.set-b .lt-r').count()==n+1)
            await pg.screenshot(path=OUT+'d_temporadas.png')
        await step('temporadas',t_ss)

        # 18 sin usuarios ni permisos por cargo
        async def t_perm():
            await go('ajustes'); t=await txt()
            ok('ajustes sin permisos por cargo', 'Permisos por cargo' not in t)
            await pg.click('[data-act="set"][data-v="personal"]'); await pg.wait_for_timeout(300); t=await txt()
            ok('personal sin PIN', 'PIN' not in t and 'Carmen' in t)
            await pg.screenshot(path=OUT+'d_personal.png')
            vis=await pg.evaluate("[...document.querySelectorAll('.ni[data-to]')].filter(a=>!a.hidden).length")
            tot=await pg.evaluate("document.querySelectorAll('.ni[data-to]').length")
            ok('todo el menú visible', vis==tot, f'{vis}/{tot}')
            await pg.click('.me'); await pg.wait_for_timeout(250)
            ok('menú sin cambiar de usuario', await pg.locator('.pop .mi:has-text("Cambiar de usuario")').count()==0)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await step('sin usuarios',t_perm)

        # 15 timeline, palette, theme
        async def t_misc():
            await go('timeline'); await pg.click('.bar >> nth=5'); await pg.wait_for_timeout(500)
            ok('timeline abre reserva', await pg.locator('#dw.open').count()==1); await close_dw()
            await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(300); await pg.keyboard.type('almac'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
            ok('palette navega', await pg.evaluate('location.hash')=='#almacen')
            await pg.click('#themeBtn'); await pg.wait_for_timeout(300)
            ok('tema oscuro', await pg.evaluate("document.documentElement.getAttribute('data-ui')")=='dark')
            await go('inicio'); await pg.screenshot(path=OUT+'dark_inicio.png')
            await go('panel'); await pg.screenshot(path=OUT+'dark_panel.png')
            await pg.click('#themeBtn'); await pg.wait_for_timeout(300)
        await step('varios',t_misc)



        # 20 facturación con Nooki
        async def t_fe_ajustes():
            await go('ajustes'); await pg.click('[data-act="set"][data-v="sunat"]'); await pg.wait_for_timeout(300)
            t=await txt(); ok('ajustes: conexión con Nooki', 'Conectado a Nooki' in t and 'api.nooki.pe' in t, t[:120])
            ok('ajustes: series del hotel', all(x in t for x in ['B001','F001','BC01','FC01','NV01']))
            ok('ajustes: sin clave SOL en el hotel', await pg.locator('#cfSol').count()==0)
            await pg.screenshot(path=OUT+'fe_ajustes.png')
            await pg.click('[data-act="cfg-amaz"]'); await pg.wait_for_timeout(300)
            await go('ventas'); ok('amazonía: ventas dice exonerado', 'Exonerado de IGV' in await txt())
            await pg.click('.vrow:has(.pill:has-text("Aceptado")) >> nth=0'); await pg.wait_for_timeout(500)
            d=await txt('#dwIn'); ok('amazonía: comprobante con op. exonerada y leyenda', 'Op. exonerada' in d and 'Amazonía' in d)
            await close_dw()
            await go('ajustes'); await pg.click('[data-act="set"][data-v="sunat"]'); await pg.wait_for_timeout(300); await pg.click('[data-act="cfg-amaz"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="nooki-test"]'); await pg.wait_for_timeout(300); ok('probar conexión', 'correcta' in await txt('#toasts'))
        await step('facturación: ajustes',t_fe_ajustes)

        async def abrir_con_saldo():
            await go('panel'); n=await pg.locator('.room').count()
            for i in range(n):
                await pg.click(f'.room >> nth={i}'); await pg.wait_for_timeout(350)
                if await pg.locator('#dwIn [data-act="pay"]').count(): return True
                await close_dw()
            return False

        async def t_fe_ruc():
            ok('hay una habitación con saldo', await abrir_con_saldo())
            await pg.click('#dwIn [data-act="pay"] >> nth=0'); await pg.wait_for_timeout(350)
            await pg.click('#payKind [data-k="Factura"]'); await pg.wait_for_timeout(150)
            await pg.fill('#payRuc',''); await pg.type('#payRuc','20600000011'); await pg.wait_for_timeout(200)
            ok('factura: razón social se completa', 'Constructora' in await pg.input_value('#payName'))
            await pg.fill('#payRuc',''); await pg.type('#payRuc','12345678901'); await pg.wait_for_timeout(200)
            ok('factura: avisa RUC inválido', 'no pasa' in await pg.inner_text('#rucH'))
            await pg.screenshot(path=OUT+'fe_cobro_factura.png')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await close_dw()
        await step('facturación: RUC al cobrar',t_fe_ruc)

        async def t_fe_offline():
            await go('ajustes'); await pg.click('[data-act="set"][data-v="sunat"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="nooki-net"]'); await pg.wait_for_timeout(300)
            await go('ventas'); ok('sin internet: aviso en ventas', await pg.locator('.nk-banner').count()==1)
            ok('hay habitación con saldo (sin internet)', await abrir_con_saldo())
            await pg.click('#dwIn [data-act="pay"] >> nth=0'); await pg.wait_for_timeout(350)
            await pg.click('#payKind [data-k="Boleta"]'); await pg.wait_for_timeout(100)
            await pg.click('[data-sel="pay-m"]'); await pg.wait_for_timeout(250); await pg.click('.pop .mi:has-text("Yape")'); await pg.wait_for_timeout(200)
            await pg.click('#payGo'); await pg.wait_for_timeout(500)
            ok('sin internet: se emite igual', 'cuando vuelva internet' in await txt('#toasts'))
            await close_dw(); await go('ventas')
            n=await pg.locator('.vrow .pill:has-text("Sin internet")').count(); ok('sin internet: queda esperando', n>=1, str(n))
            await pg.screenshot(path=OUT+'fe_sin_internet.png')
            await pg.wait_for_timeout(3200)
            ok('sin internet: no se envía solo', await pg.locator('.vrow .pill:has-text("Sin internet")').count()>=1)
            await go('ajustes'); await pg.click('[data-act="set"][data-v="sunat"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-act="nooki-net"]'); await pg.wait_for_timeout(3500)
            await go('ventas'); ok('vuelve internet: se envían solos', await pg.locator('.vrow .pill:has-text("Sin internet")').count()==0 and await pg.locator('.nk-banner').count()==0)
        await step('facturación: sin internet',t_fe_offline)

        async def t_fe_doc():
            await go('ventas'); await pg.click('.vrow:has(.pill:has-text("Aceptado")):has-text("Boleta") >> nth=0'); await pg.wait_for_timeout(500)
            d=await txt('#dwIn'); ok('comprobante con hash y QR', 'Hash:' in d and await pg.locator('#dwIn .qr').count()==1)
            await pg.click('#dwIn [data-act="doc-print"]'); await pg.wait_for_timeout(300); ok('reimprimir ticket','impresora' in await txt('#toasts'))
            await pg.click('#dwIn [data-act="doc-wa"]'); await pg.wait_for_timeout(300); await pg.fill('#waTel','12'); await pg.click('#waTGo'); await pg.wait_for_timeout(200)
            ok('whatsapp valida celular', not await pg.locator('#waTE').is_hidden())
            await pg.fill('#waTel','912345678'); await pg.click('#waTGo'); await pg.wait_for_timeout(400); ok('whatsapp enviado','WhatsApp' in await txt('#toasts'))
            await pg.screenshot(path=OUT+'fe_comprobante.png')
            await pg.click('#dwIn [data-act="doc-nc"]'); await pg.wait_for_timeout(350)
            await pg.click('[data-sel="nc-d"]'); await pg.wait_for_timeout(250); await pg.click('.pop .mi:has-text("Yape")'); await pg.wait_for_timeout(200)
            await pg.screenshot(path=OUT+'fe_nc_modal.png')
            await pg.click('#ncGo'); await pg.wait_for_timeout(600)
            t=await txt('#dwIn'); ok('nota de crédito emitida y abierta', ('BC01-' in t) and 'Comprobante que modifica' in t, t[:100])
            await pg.wait_for_timeout(3200); ok('nota de crédito aceptada', 'Aceptado por SUNAT' in await txt('#dwIn'))
            await pg.click('#dwIn .rows [data-act="doc"]'); await pg.wait_for_timeout(500)
            t=await txt('#dwIn'); ok('original muestra su nota y ya no ofrece otra', 'Notas de crédito' in t and await pg.locator('#dwIn [data-act="doc-nc"]').count()==0)
            await pg.click('#dwIn [data-act="doc-void"]'); await pg.wait_for_timeout(300); ok('no se anula con nota vigente','nota de crédito vigente' in await txt('#toasts'))
            await close_dw()
            await go('ventas'); ok('nota de crédito en la lista', 'Modifica' in await txt('#vList'))
        await step('facturación: comprobante y nota de crédito',t_fe_doc)

        async def t_fe_rech():
            await go('ventas'); await pg.click('[data-act="v-per"][data-v="mes"]'); await pg.wait_for_timeout(300)
            r=pg.locator('.vrow:has(.pill:has-text("Rechazado"))')
            if await r.count()==0: ok('hay un rechazado de ejemplo', False); return
            await r.first.click(); await pg.wait_for_timeout(500)
            ok('rechazado ofrece emitir de nuevo', await pg.locator('#dwIn [data-act="doc-reemit"]').count()==1)
            await pg.click('#dwIn [data-act="doc-reemit"]'); await pg.wait_for_timeout(900)
            ok('emitir de nuevo abre el cobro con el monto', await pg.locator('#payGo').count()==1 and float(await pg.input_value('#payAmt'))>0)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await go('ventas'); await pg.click('[data-act="v-per"][data-v="7d"]'); await pg.wait_for_timeout(200)
        await step('facturación: rechazado',t_fe_rech)

        # 19 cierre del día (al final porque cambia la fecha)
        async def t_cz():
            await go('cierre'); await pg.screenshot(path=OUT+'d_cierre_before.png')
            ok('cierre bloqueado al inicio', await pg.locator('[data-act="cz-close"][disabled]').count()==1)
            for _ in range(15):
                b=pg.locator('[data-act="cz-in"]')
                if await b.count()==0: break
                await b.first.click(); await pg.wait_for_timeout(250)
            for _ in range(15):
                b=pg.locator('.cz [data-act="res"] >> text=Check-out')
                if await b.count()==0: break
                await b.first.click(); await pg.wait_for_timeout(500)
                await pg.click('#dwIn [data-act="checkout"]'); await pg.wait_for_timeout(400)
                if await pg.locator('#coDebt').count(): await pg.click('#coDebt'); await pg.wait_for_timeout(500)
                await go('cierre')
            if await pg.locator('[data-act="cz-caja"]').count():
                await pg.click('[data-act="cz-caja"]'); await pg.wait_for_timeout(300); await pg.fill('#ccAmt','0'); await pg.click('#ccGo'); await pg.wait_for_timeout(500)
            await go('cierre')
            ok('cierre habilitado', await pg.locator('[data-act="cz-close"]:not([disabled])').count()==1, await pg.inner_text('.cz-why'))
            await pg.click('[data-act="cz-close"]'); await pg.wait_for_timeout(250); await pg.click('#czGo'); await pg.wait_for_timeout(600)
            ok('pasa al día siguiente', ' '.join((await pg.inner_text('.tag.day')).split())=='Día 211' and 'sáb 17' in (await txt()).lower(), await pg.inner_text('.tag.day'))
            await pg.screenshot(path=OUT+'d_after_close.png')
        await step('cierre del día',t_cz)

        # 16 inicio despues de todo
        await go('inicio'); await pg.screenshot(path=OUT+'d_inicio_after.png', full_page=False)
        ok('sin errores js en escritorio', len(errs)==0, ' | '.join(errs)[:400])

        # telefono
        ph=await b.new_page(viewport={'width':390,'height':844})
        perr=[]; ph.on('pageerror',lambda e: perr.append(str(e)))
        await ph.set_content(html, wait_until='load'); await ph.wait_for_timeout(500)
        wide=[]
        for v in VIEWS:
            await ph.evaluate(f"location.hash='{v}'"); await ph.wait_for_timeout(400)
            sw=await ph.evaluate('document.getElementById("mainScroll").scrollWidth')
            if sw>392: wide.append(f'{v}:{sw}')
            await ph.screenshot(path=OUT+'m_'+v+'.png')
        ok('teléfono sin desborde horizontal', not wide, ','.join(wide))
        await ph.evaluate("location.hash='restaurante'"); await ph.wait_for_timeout(300)
        await ph.click('.mesa >> nth=2'); await ph.wait_for_timeout(600); await ph.screenshot(path=OUT+'m_mesa.png')
        ok('sin errores js en teléfono', len(perr)==0, ' | '.join(perr)[:300])
        await b.close()
    fails=[r for r in results if r[0]=='FAIL']
    for r in results: print(r[0], '-', r[1], ('· '+r[2]) if r[2] and r[0]=='FAIL' else '')
    print('TOTAL', len(results), 'FAIL', len(fails))
asyncio.run(main())
