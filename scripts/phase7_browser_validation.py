"""Fictional prototype-only browser checks. Requires Python Playwright and Chromium.
Run against a disposable local preview; never point this write test at production.
Artifacts stay in /tmp/browser/phase7. No credentials or session exports.
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

APP = "http://localhost:8080"
OUTPUT = Path("/tmp/browser/phase7")
OUTPUT.mkdir(parents=True, exist_ok=True)

async def overflow(page):
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth")

async def navigation(page):
    opener = page.get_by_role("button", name="Open navigation", exact=True)
    await opener.click()
    dialog = page.get_by_role("dialog", name="Navigation", exact=True)
    await dialog.wait_for()
    assert await dialog.evaluate("e => e.contains(document.activeElement)")
    for _ in range(18):
        await page.keyboard.press("Tab")
        assert await dialog.evaluate("e => e.contains(document.activeElement)")
    await page.keyboard.press("Shift+Tab")
    assert await dialog.evaluate("e => e.contains(document.activeElement)")
    await page.keyboard.press("Escape")
    await dialog.wait_for(state="detached")
    assert await opener.evaluate("e => e === document.activeElement")

async def public_distribution(browser):
    context = await browser.new_context(viewport={"width": 390, "height": 844}, locale="en-GB")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(APP + "/business-fit/start", wait_until="networkidle")
    await page.get_by_role("button", name="Small distributor", exact=True).click()
    for heading in ["Your existing systems", "How work happens today", "Your improvement priorities", "Review your Business Fit"]:
        await page.get_by_role("button", name="Next", exact=True).click()
        await page.get_by_role("heading", name=heading, exact=True).wait_for()
        await overflow(page)
    await page.get_by_role("button", name="Generate my report", exact=True).click()
    await page.wait_for_url("**/business-fit/report")
    await page.get_by_role("button", name="Print / Save as PDF").wait_for()
    await overflow(page)
    await page.screenshot(path=str(OUTPUT / "distribution-mobile.png"))
    await page.pdf(path=str(OUTPUT / "distribution-mobile.pdf"), format="A4", print_background=True, prefer_css_page_size=True)
    await page.reload(wait_until="networkidle")
    await page.get_by_role("button", name="Print / Save as PDF").wait_for()
    await page.get_by_role("link", name="Start a new check", exact=True).click()
    await page.get_by_role("button", name="Begin check", exact=True).wait_for()
    assert not errors, errors
    await context.close()
    return {"scenario": "anonymous mobile distribution report, A4, reload and restart", "passed": True}

async def internal_task(browser):
    context = await browser.new_context(viewport={"width": 390, "height": 844}, locale="en-GB")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(APP + "/engagements/delivery_hotel", wait_until="networkidle")
    await page.get_by_label("Prototype identity", exact=True).select_option("u_manager")
    await page.get_by_role("button", name="Delivery plan", exact=True).click()
    await page.get_by_role("button", name="Create linked task", exact=False).click()
    form = page.get_by_role("form", name="Linked task", exact=True)
    await form.get_by_label("Workstream", exact=False).select_option(label="Discovery, integration & training")
    await form.get_by_label("Task title", exact=False).fill("Fictional Phase 7 mobile follow-up")
    await form.get_by_role("button", name="Save", exact=True).click()
    await page.get_by_role("heading", name="Fictional Phase 7 mobile follow-up", exact=True).wait_for()
    await page.screenshot(path=str(OUTPUT / "mobile-task-saved.png"))
    await page.reload(wait_until="networkidle")
    await page.get_by_role("button", name="Delivery plan", exact=True).click()
    await page.get_by_role("heading", name="Fictional Phase 7 mobile follow-up", exact=True).wait_for()
    await overflow(page)
    await navigation(page)
    await page.get_by_label("Prototype identity", exact=True).select_option("u_partner_pro")
    await page.get_by_role("alert").filter(has_text="denied").wait_for()
    await page.screenshot(path=str(OUTPUT / "mobile-denial.png"))
    assert not errors, errors
    await context.close()
    return {"scenario": "mobile task save/read-back, focus containment, Escape/return focus, partner denial", "passed": True}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = [await public_distribution(browser), await internal_task(browser)]
        report = {"browser": "Chromium " + browser.version, "app": APP, "results": results}
        (OUTPUT / "maintained-browser-results.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())