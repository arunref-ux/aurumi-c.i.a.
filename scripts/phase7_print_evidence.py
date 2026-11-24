"""Phase 7 print evidence (fictional data only). Generates A4 PDFs with Chromium print-to-PDF.
Inputs are service-generated envelopes written by the Phase 7 tests with PHASE7_CAPTURE=1.
Run against a local preview only; never against production.
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

APP = "http://localhost:8080"
KEY = "aurumi.cia.simulated-store.v1"
OUT = Path("qa-evidence/phase7-print")
OUT.mkdir(parents=True, exist_ok=True)
PDF = dict(format="A4", print_background=True, prefer_css_page_size=True)

async def load_envelope(page, path):
    await page.goto(APP + "/", wait_until="networkidle")
    await page.evaluate("([k,v])=>{localStorage.clear(); localStorage.setItem(k,v)}", [KEY, Path(path).read_text()])

async def proposal(browser, envelope, pid, name):
    c = await browser.new_context(locale="en-GB"); page = await c.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    await load_envelope(page, envelope)
    await page.goto(f"{APP}/proposals/{pid}", wait_until="networkidle")
    await page.get_by_role("button", name="J. Versions & preview").click()
    await page.get_by_role("button", name="Version 1", exact=True).click()
    await page.wait_for_timeout(800)
    # Same body class the in-app "Print / save as PDF" button sets before window.print().
    await page.evaluate("document.body.classList.add('printing-proposal')")
    await page.emulate_media(media="print")
    await page.pdf(path=str(OUT / name), **PDF)
    assert not errors, errors
    await c.close()

async def completion(browser, envelope, eid, name):
    c = await browser.new_context(locale="en-GB"); page = await c.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    await load_envelope(page, envelope)
    await page.goto(f"{APP}/engagements/{eid}/report", wait_until="networkidle")
    await page.wait_for_timeout(1200)
    await page.evaluate("document.body.classList.add('printing-delivery')")
    await page.emulate_media(media="print")
    await page.pdf(path=str(OUT / name), **PDF)
    assert not errors, errors
    await c.close()

async def business_fit(browser, name):
    c = await browser.new_context(locale="en-GB"); page = await c.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(APP + "/business-fit/start", wait_until="networkidle")
    await page.get_by_role("button", name="Small distributor", exact=True).click()
    for h in ["Your existing systems", "How work happens today", "Your improvement priorities", "Review your Business Fit"]:
        await page.get_by_role("button", name="Next", exact=True).click()
        await page.get_by_role("heading", name=h, exact=True).wait_for()
    await page.get_by_role("button", name="Generate my report", exact=True).click()
    await page.wait_for_url("**/business-fit/report")
    await page.get_by_role("button", name="Print / Save as PDF").wait_for()
    await page.emulate_media(media="print")
    await page.pdf(path=str(OUT / name), **PDF)
    assert not errors, errors
    await c.close()

async def main():
    j = json.load(open("/tmp/phase7-journey-ids.json"))
    s = json.load(open("/tmp/phase7-print-ids.json"))
    a = json.load(open("/tmp/phase7-amended-ids.json"))
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        print("browser", b.version)
        await business_fit(b, "01-business-fit-report.pdf")
        await proposal(b, "/tmp/phase7-journey-envelope.json", j["proposalId"], "02-standard-issued-proposal.pdf")
        await proposal(b, "/tmp/phase7-print-envelope.json", s["proposalId"], "03-long-multicurrency-proposal.pdf")
        await completion(b, "/tmp/phase7-journey-envelope.json", j["engagementId"], "04-standard-completion-report.pdf")
        await completion(b, "/tmp/phase7-amended-envelope.json", a["engagementId"], "05-amended-unsuccessful-completion-report.pdf")
        await b.close()

asyncio.run(main())
