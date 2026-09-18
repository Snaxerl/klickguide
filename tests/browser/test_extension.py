"""Real Chromium integration tests against the unchanged production manifest.

The installed temporary copy is byte-identical to dist, including its persistent
all-sites host permission. Automation does not grant extra capabilities. Native
site-access prompts and browser-managed restrictions still require manual review.
"""
from __future__ import annotations

import functools
import http.server
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
import zipfile

from playwright.sync_api import BrowserContext, Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *args: object) -> None:
        pass


class ExtensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not (ROOT / "dist/manifest.json").is_file():
            raise RuntimeError("Run npm run build before the browser tests.")
        cls.scratch = tempfile.TemporaryDirectory(prefix="klickguide-browser-")
        cls.extension_path = Path(cls.scratch.name) / "test-extension"
        shutil.copytree(ROOT / "dist", cls.extension_path)
        manifest_file = cls.extension_path / "manifest.json"
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if manifest.get("host_permissions") != ["<all_urls>"]:
            raise AssertionError("The production manifest must declare its all-sites access.")
        if manifest_file.read_bytes() != (ROOT / "dist/manifest.json").read_bytes():
            raise AssertionError("Browser tests must not change production permissions.")
        handler = functools.partial(QuietHandler, directory=str(ROOT / "tests/fixtures"))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port = cls.server.server_port
        cls.playwright = sync_playwright().start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=3)
        cls.scratch.cleanup()

    def setUp(self) -> None:
        self.profile = tempfile.TemporaryDirectory(prefix="klickguide-profile-")
        self.addCleanup(self.profile.cleanup)
        options: dict = {
            "user_data_dir": self.profile.name,
            "headless": os.environ.get("KLICKGUIDE_HEADLESS") == "1",
            "viewport": {"width": 1280, "height": 1000},
            "accept_downloads": True,
            "timeout": 30_000,
            "args": [
                f"--disable-extensions-except={self.extension_path}",
                f"--load-extension={self.extension_path}",
            ],
        }
        executable = os.environ.get("KLICKGUIDE_CHROMIUM")
        if executable:
            options["executable_path"] = executable
        else:
            options["channel"] = "chromium"
        self.context: BrowserContext = self.playwright.chromium.launch_persistent_context(**options)
        self.addCleanup(self.context.close)
        self.context.set_default_timeout(12_000)
        worker = self.context.service_workers[0] if self.context.service_workers else self.context.wait_for_event("serviceworker")
        self.extension_id = worker.url.split("/")[2]
        self.base = f"chrome-extension://{self.extension_id}/"
        self.app = self.context.new_page()
        self.app.goto(self.base + "app.html")
        expect(self.app.get_by_role("heading", name="Wissen, das bleibt.")).to_be_visible()
        self.browser_errors: list[str] = []
        self.app.on("pageerror", lambda error: self.browser_errors.append(str(error)))

    def tearDown(self) -> None:
        self.assertEqual(self.browser_errors, [], "Uncaught errors on an extension page")

    def command(self, kind: str, **fields: object):
        reply = self.app.evaluate("message => chrome.runtime.sendMessage(message)", {"type": kind, **fields})
        self.assertTrue(reply and reply.get("ok"), reply)
        return reply["value"]

    def seed_guide(self, title: str = "Eine klare Anleitung", with_image: bool = False) -> str:
        return self.app.evaluate(
            """async ({title, withImage}) => {
              const db = await import('./platform/database.js');
              const {createGuide, createStep} = await import('./core/operations.js');
              const guide = await db.createStoredGuide(createGuide(title));
              let image;
              if (withImage) {
                const canvas = new OffscreenCanvas(800, 400);
                const context = canvas.getContext('2d');
                context.fillStyle = '#ffffff'; context.fillRect(0, 0, 800, 400);
                context.fillStyle = '#e34848'; context.fillRect(80, 40, 200, 100);
                image = {blob: await canvas.convertToBlob({type: 'image/png'}), width: 800, height: 400};
              }
              const step = createStep('note', 'Einen neuen Eintrag öffnen');
              step.body = '<img src=x onerror=alert(1)> is plain text, not executable markup.';
              await db.appendRecordedStep(guide.id, step, image);
              return guide.id;
            }""",
            {"title": title, "withImage": with_image},
        )

    def open_guide(self, guide_id: str) -> None:
        self.app.goto(f"{self.base}app.html?guide={guide_id}")
        expect(self.app.get_by_label("Schritttitel", exact=True)).to_be_visible()

    def read_guide(self, guide_id: str) -> dict:
        return self.app.evaluate("async id => (await import('./platform/database.js')).getGuide(id)", guide_id)

    def capture_fixture(self, open_form: bool = False) -> tuple[Page, dict]:
        fixture = self.context.new_page()
        fixture.goto(f"http://127.0.0.1:{self.port}/index.html")
        if open_form:
            fixture.get_by_role("button", name="Neue Aufgabe", exact=True).click()
        fixture.bring_to_front()
        tab_id = self.app.evaluate("async () => (await chrome.tabs.query({active: true, currentWindow: true}))[0].id")
        session = self.command("START", tabId=tab_id, title="Ein Ablauf auf der Demo-Seite")
        expect(fixture.locator('[data-klickguide-recorder][data-capture-state="ready"]')).to_have_count(1)
        return fixture, session

    def wait_for_steps(self, guide_id: str, count: int) -> None:
        self.app.wait_for_function(
            "async ({id, count}) => (await (await import('./platform/database.js')).getGuide(id)).steps.length >= count",
            arg={"id": guide_id, "count": count},
        )

    def inspect_image(self, guide_id: str, x: float, y: float) -> dict:
        return self.app.evaluate(
            """async ({id, x, y}) => {
              const db = await import('./platform/database.js');
              const bundle = await db.readBundle(id);
              const image = bundle.images.find(item => item.id === bundle.guide.steps[0].imageId);
              if (!image) throw new Error('Expected an actual stored PNG');
              const bitmap = await createImageBitmap(image.blob);
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
              const pixel = Array.from(context.getImageData(Math.floor(x * bitmap.width), Math.floor(y * bitmap.height), 1, 1).data);
              bitmap.close();
              return {pixel, width: image.width, height: image.height, count: bundle.images.length};
            }""",
            {"id": guide_id, "x": x, "y": y},
        )

    def test_manual_guide_is_editable_and_persisted(self) -> None:
        self.app.get_by_role("button", name="Neue Anleitung", exact=True).click()
        self.app.get_by_label("Titel der Anleitung").fill("Mein erster Ablauf")
        self.app.get_by_role("button", name="Anlegen", exact=True).click()
        self.app.get_by_role("button", name="Ersten Schritt hinzufügen").click()
        self.app.get_by_label("Schritttitel", exact=True).fill("Die Übersicht öffnen")
        self.app.get_by_label("Beschreibung & Hinweise").fill("Eine verständliche Erklärung mit Umlauten: äöü.")
        self.app.get_by_role("button", name="Speichern", exact=True).click()
        expect(self.app.get_by_role("button", name="Speichern", exact=True)).to_be_disabled()
        self.app.reload()
        expect(self.app.get_by_label("Schritttitel", exact=True)).to_have_value("Die Übersicht öffnen")
        expect(self.app.get_by_label("Beschreibung & Hinweise")).to_have_value("Eine verständliche Erklärung mit Umlauten: äöü.")

    def test_duplicate_step_and_reorder(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        self.open_guide(guide_id)
        self.app.get_by_role("button", name="Schritt duplizieren", exact=True).click()
        expect(self.app.locator(".step-list > li")).to_have_count(2)
        self.app.get_by_label("Schritttitel", exact=True).fill("Der kopierte Schritt")
        self.app.get_by_role("button", name="Schritt nach oben", exact=True).click()
        self.app.get_by_role("button", name="Speichern", exact=True).click()
        expect(self.app.get_by_role("button", name="Speichern", exact=True)).to_be_disabled()
        guide = self.read_guide(guide_id)
        self.assertEqual(guide["steps"][0]["title"], "Der kopierte Schritt")
        self.assertNotEqual(guide["steps"][0]["imageId"], guide["steps"][1]["imageId"])

    def test_redaction_replaces_raster_without_retaining_an_original(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        self.open_guide(guide_id)
        expect(self.app.locator(".image-meta")).to_be_visible()
        self.app.get_by_role("button", name="Schwärzen", exact=True).click()
        self.app.get_by_text("Bereich per Tastatur festlegen", exact=True).click()
        for label, value in [("X (%)", "10"), ("Y (%)", "10"), ("Breite (%)", "25"), ("Höhe (%)", "25")]:
            self.app.get_by_label(label, exact=True).fill(value)
        self.app.get_by_role("button", name="Bereich hinzufügen", exact=True).click()
        self.app.get_by_role("button", name="Anwenden", exact=True).click()
        self.app.get_by_role("button", name="Dauerhaft anwenden", exact=True).click()
        expect(self.app.locator("dialog[open]")).to_have_count(0)
        expect(self.app.get_by_role("button", name="Anwenden", exact=True)).to_be_disabled()
        result = self.inspect_image(guide_id, 0.2, 0.2)
        self.assertEqual(result["pixel"], [17, 24, 39, 255])
        self.assertEqual(result["count"], 1)
        self.app.reload()
        self.assertEqual(self.inspect_image(guide_id, 0.2, 0.2)["pixel"], [17, 24, 39, 255])

    def test_crop_changes_actual_png_dimensions(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        self.open_guide(guide_id)
        expect(self.app.locator(".image-meta")).to_be_visible()
        self.app.get_by_role("button", name="Zuschneiden", exact=True).click()
        self.app.get_by_text("Bereich per Tastatur festlegen", exact=True).click()
        for label, value in [("X (%)", "0"), ("Y (%)", "0"), ("Breite (%)", "50"), ("Höhe (%)", "50")]:
            self.app.get_by_label(label, exact=True).fill(value)
        self.app.get_by_role("button", name="Bereich hinzufügen", exact=True).click()
        self.app.get_by_role("button", name="Anwenden", exact=True).click()
        self.app.get_by_role("button", name="Dauerhaft anwenden", exact=True).click()
        expect(self.app.locator(".image-meta")).to_contain_text("400 × 200 px")
        result = self.inspect_image(guide_id, 0.5, 0.5)
        self.assertEqual((result["width"], result["height"]), (400, 200))

    def test_export_review_gate_and_three_download_formats(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        self.open_guide(guide_id)
        self.app.get_by_role("button", name="Prüfen & exportieren", exact=True).click()
        html = self.app.get_by_role("button", name="HTML", exact=True)
        expect(html).to_be_disabled()
        self.app.locator("#export-reviewed").check()
        expect(html).to_be_enabled()
        for name in ["HTML", "Markdown ZIP", "Projektsicherung"]:
            with self.app.expect_download() as event:
                self.app.get_by_role("button", name=name, exact=True).click()
            download = event.value
            contents = Path(download.path()).read_bytes()
            if name == "HTML":
                self.assertIn(b"&lt;img src=x onerror=alert(1)&gt;", contents)
                self.assertNotIn(b"<img src=x", contents)
                self.assertIn(b"data:image/png;base64,", contents)
            elif name == "Markdown ZIP":
                with zipfile.ZipFile(io.BytesIO(contents)) as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertIn("README.md", archive.namelist())
                    self.assertEqual(len([entry for entry in archive.namelist() if entry.endswith(".png")]), 1)
            else:
                backup = json.loads(contents)
                self.assertEqual(backup["format"], "klickguide")
                self.assertEqual(len(backup["images"]), 1)

    def test_backup_import_uses_new_ids_and_retains_image(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        result = self.app.evaluate(
            """async id => {
              const db = await import('./platform/database.js');
              const {blobToDataUrl} = await import('./platform/images.js');
              const {importFile} = await import('./platform/files.js');
              const bundle = await db.readBundle(id);
              const images = await Promise.all(bundle.images.map(async image => ({id: image.id, dataUrl: await blobToDataUrl(image.blob)})));
              const file = new File([JSON.stringify({format:'klickguide',version:1,guide:bundle.guide,images})], 'backup.klickguide.json');
              const copyId = await importFile(file);
              const copy = await db.readBundle(copyId);
              return {copyId, originalStep:bundle.guide.steps[0].id, copyStep:copy.guide.steps[0].id, imageCount:copy.images.length, guideCount:(await db.listGuides()).length};
            }""", guide_id,
        )
        self.assertNotEqual(result["copyId"], guide_id)
        self.assertNotEqual(result["originalStep"], result["copyStep"])
        self.assertEqual((result["imageCount"], result["guideCount"]), (1, 2))

    def test_concurrent_save_conflicts_and_delete_cascades(self) -> None:
        guide_id = self.seed_guide(with_image=True)
        result = self.app.evaluate(
            """async id => {
              const db = await import('./platform/database.js');
              const first = await db.getGuide(id), second = await db.getGuide(id);
              first.title = 'First edit'; second.title = 'Second edit';
              const results = await Promise.allSettled([db.saveGuide(first), db.saveGuide(second)]);
              const imageId = first.steps[0].imageId;
              await db.deleteGuide(id);
              return {states:results.map(result => result.status), imageRemains:Boolean(await db.getImage(imageId)), guideCount:(await db.listGuides()).length};
            }""", guide_id,
        )
        self.assertEqual(sorted(result["states"]), ["fulfilled", "rejected"])
        self.assertFalse(result["imageRemains"])
        self.assertEqual(result["guideCount"], 0)

    def test_malformed_import_is_atomic(self) -> None:
        result = self.app.evaluate(
            """async () => {
              const {importFile} = await import('./platform/files.js');
              const db = await import('./platform/database.js');
              let rejected = false;
              try { await importFile(new File(['{"format":"other"}'], 'wrong.json')); } catch { rejected = true; }
              return {rejected, count:(await db.listGuides()).length};
            }"""
        )
        self.assertEqual(result, {"rejected": True, "count": 0})

    def test_recorded_click_masks_form_fields_in_stored_png(self) -> None:
        self.app.evaluate("""async () => chrome.storage.local.set({settings:{guideLanguage:'de',autoRedactSensitiveAreas:true,maskMedia:false,keepOrigin:false,maskSelectors:[]}})""")
        fixture, session = self.capture_fixture(open_form=True)
        fixture.get_by_role("button", name="Aufgabe speichern", exact=True).click()
        self.wait_for_steps(session["guideId"], 1)
        guide = self.read_guide(session["guideId"])
        self.assertTrue(guide["steps"][0]["imageId"], guide["steps"][0].get("warning"))
        self.assertIn("Aufgabe speichern", guide["steps"][0]["title"])
        point = fixture.locator("#contact").evaluate("element => { const box=element.getBoundingClientRect(); return {x:(box.x+box.width/2)/innerWidth,y:(box.y+box.height/2)/innerHeight}; }")
        self.assertGreaterEqual(point["y"], 0)
        self.assertLess(point["y"], 1)
        self.assertEqual(self.inspect_image(session["guideId"], point["x"], point["y"])["pixel"], [17, 24, 39, 255])
        self.assertNotIn("demo.private@example.invalid", json.dumps(guide))
        self.assertNotIn("do-not-record-this", json.dumps(guide))

    def test_field_values_are_not_used_as_step_captions(self) -> None:
        fixture, session = self.capture_fixture(open_form=True)
        fixture.locator("#contact").fill("never-save-this@example.invalid")
        fixture.locator("#contact").press("Tab")
        self.wait_for_steps(session["guideId"], 1)
        guide = self.read_guide(session["guideId"])
        self.assertNotIn("never-save-this@example.invalid", json.dumps(guide))
        self.assertTrue(any(step["kind"] == "input" for step in guide["steps"]))

    def test_switching_tabs_pauses_until_explicit_resume(self) -> None:
        fixture, session = self.capture_fixture()
        self.app.bring_to_front()
        self.app.wait_for_function("async () => (await chrome.runtime.sendMessage({type:'GET_STATE'})).value?.status === 'paused'")
        fixture.bring_to_front()
        fixture.get_by_role("button", name="Aktion A", exact=True).click()
        self.assertEqual(self.command("GET_STATE")["status"], "paused")
        self.assertEqual(self.read_guide(session["guideId"])["steps"], [])
        self.command("RESUME")
        self.command("CAPTURE_MANUAL")
        guide = self.read_guide(session["guideId"])
        self.assertEqual(len(guide["steps"]), 1)
        self.assertIsNotNone(guide["steps"][0]["imageId"])

    def test_domain_change_continues_without_another_permission_request(self) -> None:
        fixture, session = self.capture_fixture()
        fixture.goto(f"http://localhost:{self.port}/next.html")
        self.app.wait_for_function(
            """async origin => {
              const reply = await chrome.runtime.sendMessage({type:'GET_STATE'});
              return reply.value?.origin === origin && Boolean(reply.value.documentToken);
            }""", arg=f"http://localhost:{self.port}",
        )
        current = self.command("GET_STATE")
        self.assertEqual(current["status"], "recording")
        self.assertEqual(current["guideId"], session["guideId"])
        self.assertEqual(current["reason"], "")
        self.command("CAPTURE_MANUAL")
        guide = self.read_guide(session["guideId"])
        self.assertEqual(len(guide["steps"]), 1)
        self.assertIsNotNone(guide["steps"][0]["imageId"])

    def test_same_origin_reload_reconnects_without_resuming(self) -> None:
        fixture, session = self.capture_fixture()
        original_token = session["documentToken"]
        fixture.reload()
        self.app.wait_for_function(
            """async token => {
              const reply = await chrome.runtime.sendMessage({type:'GET_STATE'});
              return Boolean(reply.value?.documentToken) && reply.value.documentToken !== token;
            }""", arg=original_token,
        )
        self.assertEqual(self.command("GET_STATE")["status"], "recording")
        self.command("CAPTURE_MANUAL")
        self.assertIsNotNone(self.read_guide(session["guideId"])["steps"][0]["imageId"])

    def test_manual_pause_survives_a_domain_change(self) -> None:
        fixture, session = self.capture_fixture()
        self.command("PAUSE")
        fixture.goto(f"http://localhost:{self.port}/next.html")
        self.app.wait_for_function(
            """async origin => {
              const reply = await chrome.runtime.sendMessage({type:'GET_STATE'});
              return reply.value?.origin === origin && Boolean(reply.value.documentToken);
            }""", arg=f"http://localhost:{self.port}",
        )
        self.assertEqual(self.command("GET_STATE")["status"], "paused")
        self.assertEqual(self.read_guide(session["guideId"])["steps"], [])
        self.command("RESUME")
        self.command("CAPTURE_MANUAL")
        self.assertIsNotNone(self.read_guide(session["guideId"])["steps"][0]["imageId"])

    def test_broad_site_access_does_not_record_unselected_tabs(self) -> None:
        fixture, session = self.capture_fixture()
        other = self.context.new_page()
        other.goto(f"http://localhost:{self.port}/index.html")
        expect(other.locator("[data-klickguide-recorder]")).to_have_count(0)
        self.app.wait_for_function("async () => (await chrome.runtime.sendMessage({type:'GET_STATE'})).value?.status === 'paused'")
        other.get_by_role("button", name="Neue Aufgabe", exact=True).click()
        self.assertEqual(self.read_guide(session["guideId"])["steps"], [])
        fixture.bring_to_front()
        self.assertEqual(self.command("GET_STATE")["status"], "paused")

    def test_stopping_prevents_reinjection_on_navigation(self) -> None:
        fixture, _session = self.capture_fixture()
        self.command("STOP")
        fixture.goto(f"http://localhost:{self.port}/next.html")
        expect(fixture.locator("[data-klickguide-recorder]")).to_have_count(0)
        self.assertIsNone(self.command("GET_STATE"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
