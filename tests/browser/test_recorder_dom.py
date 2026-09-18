"""Real Chromium DOM/pixel tests with a test-only transport and screenshot adapter.

Runs production content.js and FrameBuffer against real trusted pointer/keyboard
input. Does NOT install an extension or certify native Chrome API permissions.
No managed browser policies are changed. The fixture is set_content on about:blank.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
from pathlib import Path
import re
import unittest

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = """<!doctype html><html><head><style>
html,body{margin:0;background:#fff;color:#182235;font:16px/1.5 system-ui}
main{padding:40px;width:780px}a{display:block;padding:15px;color:#214bbb}
h3{margin:0}small{display:block}button{padding:14px;margin:10px;background:#ddd;border:1px solid #888}
#cookie{position:fixed;bottom:40px;left:40px;background:rgb(245,190,72);padding:25px;width:450px}
input{padding:12px;display:block}#result{margin:15px 0}
</style></head><body><main>
<h1>Recorder regression fixture</h1>
<a id="result-link" href="#destination"><span>Search Publisher</span><small>https://example.invalid/path › Breadcrumb</small><h3>Eine Anleitung öffnen</h3></a>
<button id="open">Dialog öffnen</button><button id="other">Zweite Aktion</button>
<label for="email">E-Mail-Adresse</label><input id="email" value="private@example.invalid">
<div id="result">Unveränderter Ausgangszustand</div>
<div id="cookie"><p>Auswahl vor der Aktion</p><button id="reject">Alle ablehnen</button></div>
</main><script>
window.clickCount=0;
document.querySelector('#reject').addEventListener('click',event=>{
 window.clickCount++; window.lastClickTrusted=event.isTrusted;
 document.querySelector('#cookie').remove();
 document.querySelector('#result').textContent='Cookie-Auswahl wurde geschlossen';
});
document.querySelector('#open').addEventListener('click',()=>{
 const button=document.createElement('button');button.id='dialog-save';button.textContent='Dialog speichern';
 document.querySelector('#result').replaceChildren(button);
});
document.querySelector('#result-link').addEventListener('click',event=>{event.preventDefault();document.querySelector('main').replaceChildren(document.createTextNode('Folgeseite'));});
</script></body></html>"""


def browser_module(name: str) -> str:
    """Join dependency-free production modules for an opaque-origin test page."""
    source = (ROOT / "dist" / name).read_text()
    source = re.sub(r"^import .*?;\n", "", source, flags=re.M)
    return re.sub(r"^export ", "", source, flags=re.M)


class RecorderDomTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.playwright = await async_playwright().start()
        self.addAsyncCleanup(self.playwright.stop)
        options = {"headless": True}
        executable = os.environ.get("KLICKGUIDE_CHROMIUM")
        if executable:
            options["executable_path"] = executable
        self.browser = await self.playwright.chromium.launch(**options)
        self.addAsyncCleanup(self.browser.close)
        self.page = await self.browser.new_page(viewport={"width": 1280, "height": 850})
        self.errors: list[str] = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        await self.page.set_content(FIXTURE)
        self.actions: list[dict] = []
        self.frames: dict[int, bytes] = {}
        self.lock = asyncio.Lock()
        self.last_capture = 0
        self.transport_errors = []
        self.session = {"guideId": "fixture-guide", "tabId": 1, "windowId": 1, "origin": "null", "documentToken": "", "browserDocumentId": "", "status": "recording", "reason": "", "stepCount": 0, "lastCaptureAt": 0, "settings": {"guideLanguage": "de", "autoRedactSensitiveAreas": False, "maskMedia": False, "keepOrigin": False, "maskSelectors": []}}
        await self.page.expose_binding("recorderRequest", self.request)
        await self.page.add_script_tag(content="""
          window.recorderListeners=new Set();
          window.chrome={runtime:{id:'dom-test',sendMessage:message=>window.recorderRequest(message),
            onMessage:{addListener:fn=>window.recorderListeners.add(fn),removeListener:fn=>window.recorderListeners.delete(fn)}}};
          window.toRecorder=message=>new Promise(resolve=>{
            for(const listener of window.recorderListeners) listener(message,{id:'dom-test'},resolve);
          });
        """)
        bundled = browser_module("core/geometry.js") + browser_module("core/frame-buffer.js")
        await self.page.add_script_tag(content="(()=>{" + bundled + ";window.testFrameBuffer=new FrameBuffer();})();")
        self.content = (ROOT / "dist/recorder/content.js").read_text()
        await self.page.add_script_tag(content=self.content)
        response = await self.send({"type": "CONFIGURE_RECORDER", "session": self.session})
        self.session["documentToken"] = response["documentToken"]
        await self.ready()

    async def asyncTearDown(self) -> None:
        try:
            await self.send({"type": "DISPOSE_RECORDER"})
            self.assertEqual(self.errors, [])
            self.assertEqual(self.transport_errors, [])
        finally:
            pass  # addAsyncCleanup also runs if setup fails.

    async def send(self, command: dict):
        return await asyncio.wait_for(self.page.evaluate("message=>window.toRecorder(message)", command), timeout=5)

    async def ready(self) -> None:
        await expect(self.page.locator('[data-klickguide-recorder][data-capture-state="ready"]')).to_have_count(1, timeout=10_000)

    async def wait_actions(self, count: int) -> None:
        for _ in range(150):
            if len(self.actions) >= count:
                return
            await asyncio.sleep(.04)
        self.fail(f"Expected {count} actions, got {len(self.actions)}")

    async def request(self, _source: dict, command: dict):
        async with self.lock:
            kind = command["type"]
            if os.environ.get("KLICKGUIDE_DEBUG"):
                print("transport", kind, flush=True)
            if kind == "CACHE_FRAME":
                now = await self.page.evaluate("Date.now()")
                delay = max(0, self.last_capture + 650 - now)
                if delay:
                    return {"ok": True, "value": {"ready": False, "stateRevision": -1, "capturedAt": 0, "retryAfter": delay}}
                capture_id = f"capture-{now}"
                request = {"captureId": capture_id, "documentToken": self.session["documentToken"]}
                try:
                    first = await self.send({"type": "PREPARE_CAPTURE", **request})
                    if not first.get("ok"):
                        return {"ok": False, "error": "Preparation failed"}
                    if os.environ.get("KLICKGUIDE_DEBUG"):
                        print("prepare", first, flush=True)
                    before = first["value"]
                    self.assertTrue(before["toolbarHidden"])
                    self.last_capture = await self.page.evaluate("Date.now()")
                    pixels = await self.page.screenshot(caret="initial")
                    captured_at = await self.page.evaluate("Date.now()")
                    second = await self.send({"type": "CAPTURE_SNAPSHOT", **request})
                    after = second["value"]
                    if os.environ.get("KLICKGUIDE_DEBUG"):
                        print("after", after, flush=True)
                    if before["stateRevision"] != after["stateRevision"] or before["interactionRevision"] != after["interactionRevision"] or before["viewport"] != after["viewport"]:
                        return {"ok": True, "value": {"ready": False, "stateRevision": -1, "capturedAt": 0, "retryAfter": 0}}
                    self.frames[captured_at] = pixels
                    await self.page.evaluate("""({snapshot,capturedAt})=>window.testFrameBuffer.add({guideId:'fixture-guide',snapshot,capturedAt,image:{blob:new Blob(['masked-test-placeholder']),width:1280,height:850}})""", {"snapshot": before, "capturedAt": captured_at})
                    return {"ok": True, "value": {"ready": True, "stateRevision": before["stateRevision"], "capturedAt": captured_at, "retryAfter": 0}}
                except Exception as error:
                    self.transport_errors.append(str(error))
                    if os.environ.get("KLICKGUIDE_DEBUG"):
                        print("transport error", repr(error), flush=True)
                    raise
                finally:
                    await self.send({"type": "RESTORE_RECORDER", "captureId": capture_id})
            if kind == "RECORD_ACTION":
                action = command["action"]
                matched = await self.page.evaluate("action=>{const frame=window.testFrameBuffer.find('fixture-guide',action);return frame?{capturedAt:frame.capturedAt,snapshot:frame.snapshot}:null}", action)
                self.actions.append({"action": action, "frame": matched})
                self.session["stepCount"] = len(self.actions)
                await self.send({"type": "CONFIGURE_RECORDER", "session": self.session})
                return {"ok": True, "value": self.session}
            return {"ok": True, "value": self.session}

    async def test_search_result_uses_heading_not_publisher_or_url(self):
        await self.page.locator('#result-link h3').click()
        await self.wait_actions(1)
        item = self.actions[0]
        self.assertEqual(item['action']['label'], 'Eine Anleitung öffnen')
        self.assertNotIn('example.invalid', json.dumps(item['action']))
        self.assertIsNotNone(item['frame'])
        self.assertIn('Folgeseite', await self.page.locator('main').text_content())
        self.assertLessEqual(item['frame']['capturedAt'], item['action']['observedAt'])

    async def test_dismissed_dialog_keeps_pre_click_image_and_trusted_click(self):
        await self.page.locator('#reject').click()
        await self.wait_actions(1)
        item = self.actions[0]
        self.assertEqual(item['action']['label'], 'Alle ablehnen')
        self.assertIsNotNone(item['frame'])
        await expect(self.page.locator('#cookie')).to_have_count(0)
        self.assertEqual(await self.page.evaluate('window.clickCount'), 1)
        self.assertTrue(await self.page.evaluate('window.lastClickTrusted'))
        from PIL import Image
        image = Image.open(io.BytesIO(self.frames[item['frame']['capturedAt']]))
        self.assertEqual(image.getpixel((45, 670))[:3], (245, 190, 72))

    async def test_toolbar_is_absent_in_actual_prepared_pixels(self):
        from PIL import Image
        image = Image.open(io.BytesIO(self.frames[max(self.frames)]))
        self.assertEqual(image.getpixel((1000, 35))[:3], (255, 255, 255))
        await expect(self.page.locator('[data-klickguide-recorder]')).to_be_visible()

    async def test_injection_is_idempotent(self):
        old_token = self.session['documentToken']
        await self.page.add_script_tag(content=self.content)
        response = await self.send({'type': 'CONFIGURE_RECORDER', 'session': self.session})
        self.assertEqual(response['documentToken'], old_token)
        self.assertEqual(await self.page.locator('[data-klickguide-recorder]').count(), 1)
        self.assertEqual(await self.page.evaluate('window.recorderListeners.size'), 1)

    async def test_capture_locks_restore_only_their_own_lease(self):
        for capture_id in ['first-lease', 'second-lease']:
            reply = await self.send({'type':'PREPARE_CAPTURE','captureId':capture_id,'documentToken':self.session['documentToken']})
            self.assertTrue(reply['value']['toolbarHidden'])
        await self.send({'type':'RESTORE_RECORDER','captureId':'first-lease'})
        self.assertEqual(await self.page.locator('[data-klickguide-recorder]').evaluate("element=>getComputedStyle(element).visibility"), 'hidden')
        await self.send({'type':'RESTORE_RECORDER','captureId':'second-lease'})
        await expect(self.page.locator('[data-klickguide-recorder]')).to_be_visible()

    async def test_pointer_hover_does_not_create_steps(self):
        await self.page.locator('#open').hover()
        await self.page.wait_for_timeout(800)
        self.assertEqual(self.actions, [])

    async def test_keyboard_click_is_recorded_once(self):
        await self.page.locator('#other').focus()
        await self.ready()
        await self.page.locator('#other').press('Enter')
        await self.wait_actions(1)
        self.assertEqual(len(self.actions), 1)
        self.assertEqual(self.actions[0]['action']['label'], 'Zweite Aktion')
        self.assertIsNotNone(self.actions[0]['frame'])

    async def test_newly_rendered_control_never_uses_old_page_frame(self):
        await self.page.locator('#open').click()
        # Immediate second click intentionally has no settling delay.
        await self.page.locator('#dialog-save').click()
        await self.wait_actions(2)
        second = self.actions[1]
        if second['frame'] is not None:
            tokens = [item['token'] for item in second['frame']['snapshot']['targets']]
            self.assertIn(second['action']['targetToken'], tokens)
            self.assertEqual(second['frame']['snapshot']['stateRevision'], second['action']['stateRevision'])
        self.assertEqual(second['action']['label'], 'Dialog speichern')

    async def test_two_fast_clicks_on_unchanged_page_both_have_pre_click_frames(self):
        await self.page.locator('#other').click()
        await self.page.locator('#other').click()
        await self.wait_actions(2)
        self.assertTrue(all(item['frame'] for item in self.actions))
        self.assertEqual(len(self.actions), 2)

    async def test_private_input_value_never_enters_caption(self):
        await self.page.locator('#email').click()
        await self.ready()
        await self.page.locator('#email').fill('never-copy-this@example.invalid')
        await self.page.locator('#email').press('Tab')
        await self.wait_actions(1)
        self.assertEqual(self.actions[0]['action']['kind'], 'input')
        self.assertEqual(self.actions[0]['action']['label'], 'E-Mail-Adresse')
        self.assertNotIn('never-copy-this', json.dumps(self.actions))
        self.assertNotIn('private@example.invalid', json.dumps(self.actions))

    async def test_mutations_inside_open_shadow_root_invalidate_frame(self):
        await self.page.evaluate("""()=>{const host=document.createElement('section');document.querySelector('main').append(host);const root=host.attachShadow({mode:'open'});const button=document.createElement('button');button.textContent='Shadow control';root.append(button);window.demoShadow=root;}""")
        await self.ready()
        await self.page.evaluate("window.demoShadow.querySelector('button').textContent='Changed shadow control'")
        await self.page.get_by_role('button', name='Changed shadow control').click()
        await self.wait_actions(1)
        item = self.actions[0]
        if item['frame']:
            self.assertEqual(item['frame']['snapshot']['stateRevision'], item['action']['stateRevision'])
        self.assertEqual(item['action']['label'], 'Changed shadow control')


class EditorLayoutTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.playwright = await async_playwright().start()
        self.addAsyncCleanup(self.playwright.stop)
        options = {"headless": True}
        if os.environ.get("KLICKGUIDE_CHROMIUM"):
            options["executable_path"] = os.environ["KLICKGUIDE_CHROMIUM"]
        self.browser = await self.playwright.chromium.launch(**options)
        self.addAsyncCleanup(self.browser.close)
        self.page = await self.browser.new_page(viewport={"width":1280,"height":850})
        await self.page.set_content('<div class="image-stage"><canvas width="2400" height="1600"></canvas></div>')
        await self.page.add_style_tag(content=(ROOT/'dist/assets/app.css').read_text())

    async def test_preview_fits_without_changing_bitmap_or_aspect_ratio(self):
        for width in [1100, 480, 240]:
            with self.subTest(container_width=width):
                await self.page.locator('.image-stage').evaluate('(element,width)=>element.style.width=width+"px"',width)
                metrics = await self.page.locator('canvas').evaluate('element=>({width:element.clientWidth,height:element.clientHeight,bitmapWidth:element.width,bitmapHeight:element.height})')
                self.assertLessEqual(metrics['height'],510)
                self.assertLessEqual(metrics['width'],width)
                self.assertAlmostEqual(metrics['width']/metrics['height'],1.5,delta=.02)
                self.assertEqual((metrics['bitmapWidth'],metrics['bitmapHeight']),(2400,1600))

    async def test_sidebar_clamps_display_not_saved_text(self):
        title = 'Ein langer Titel mit einer präzisen Erklärung des Arbeitsschritts. '*8
        await self.page.evaluate("title=>{const entry=document.createElement('button');entry.className='step-link';entry.style.width='180px';entry.title=title;const caption=document.createElement('span');caption.className='step-title';caption.textContent=title;entry.append(caption);document.body.append(entry);}",title)
        metrics = await self.page.locator('.step-title').evaluate("element=>({height:element.clientHeight,lineHeight:parseFloat(getComputedStyle(element).lineHeight),scrollHeight:element.scrollHeight})")
        self.assertLessEqual(metrics['height'],3*metrics['lineHeight']+1)
        self.assertGreater(metrics['scrollHeight'],metrics['height'])
        self.assertEqual(await self.page.locator('.step-title').text_content(),title)
        self.assertEqual(await self.page.locator('.step-link').get_attribute('title'),title)


if __name__ == '__main__':
    unittest.main(verbosity=2)
