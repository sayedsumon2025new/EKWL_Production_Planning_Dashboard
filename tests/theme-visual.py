"""Browser regressions for the site theme and PR #9's five review findings.

Run with Python Playwright and a Chromium executable (TLS verification stays on):
    python3 tests/theme-visual.py
Optional: --baseline-css PATH reproduces the findings against the reviewed CSS;
--artifacts DIR saves screenshots and PDFs with/without printed backgrounds.
All Supabase requests are intercepted; fixtures never touch production data.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import shutil
from threading import Thread
import unittest

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OPTIONS = None
FIXTURE = """() => {
  SITE_USER_PROFILE={role:'admin',status:'active',permissions:{}};
  ACTIVE_PLAN_UPLOAD={id:101,planning_month:'2026-10-01',uploaded_at:'2026-10-01'};
  DATA=[
    {record_id:1,month:'Oct-26',ewo:'A100',line:1,buyer:'Buyer A',style:'T-Shirt',color:'Blue',po:'PO1',smv:5,orderqty:3000,planqty:1200,startdate:'2026-10-01',enddate:'2026-10-02'},
    {record_id:2,month:'Oct-26',ewo:'A100',line:1,buyer:'Buyer A',style:'T-Shirt',color:'Red',po:'PO2',smv:5,orderqty:2000,planqty:800,startdate:'2026-10-01',enddate:'2026-10-02'},
    {record_id:3,month:'Oct-26',ewo:'B200',line:2,buyer:'Buyer B',style:'Polo',color:'Black',po:'PO3',smv:8,orderqty:6000,planqty:1500,startdate:'2026-10-02',enddate:'2026-10-03'}];
  DAILY_PLAN=DATA.map(r=>({record_id:r.record_id,line:r.line,ewo:r.ewo,style:r.style,color:r.color,date:r.startdate,value:r.planqty}));
  MONTHS=['Oct-26'];PLAN_UPLOAD_CATALOG=[ACTIVE_PLAN_UPLOAD];
  SS_MODE='preview';
  SS_ROWS=[
    {source_row_no:2,row_data:{Buyer:'Buyer A',EWO:'A100',Line:'1',EFD:'1-Oct-26','GMT Qty':'3000','PP comment Plan':'1-Oct','PP comment Actual':'2-Oct','SS Fabric Plan':'3-Oct','SS Fabric Actual':''}},
    {source_row_no:3,row_data:{Buyer:'Buyer B',EWO:'B200',Line:'2',EFD:'2-Oct-26','GMT Qty':'6000','PP comment Plan':'2-Oct','PP comment Actual':'2-Oct'}}];
  populateSizeSetFilters();
  document.body.classList.remove('site-locked');
  document.getElementById('site-login-gate').classList.add('hidden');
  renderHome();
} """


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def rgb(value):
    return tuple(float(n) for n in re.findall(r"[\d.]+", value)[:3])


def contrast(foreground, background):
    def luminance(color):
        channels = [n / 255 for n in rgb(color)]
        channels = [n / 12.92 if n <= .04045 else ((n + .055) / 1.055) ** 2.4
                    for n in channels]
        return sum(n * weight for n, weight in zip(channels, (.2126, .7152, .0722)))
    light, dark = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (light + .05) / (dark + .05)


class ThemeVisualTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=OPTIONS.chromium, args=['--no-sandbox'])
        if OPTIONS.artifacts:
            OPTIONS.artifacts.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def setUp(self):
        self.context = self.browser.new_context(
            viewport={'width':1440, 'height':1000}, reduced_motion='reduce')
        self.page = self.context.new_page()
        self.page.set_default_timeout(10000)
        self.errors, self.failed_requests = [], []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.page.on('requestfailed', lambda r: self.failed_requests.append(r.url))
        self.page.route('https://*.supabase.co/**',
                        lambda r: r.fulfill(body='[]', content_type='application/json'))
        if OPTIONS.baseline_css:
            self.page.route('**/dashboard-theme.css', lambda r: r.fulfill(
                body=OPTIONS.baseline_css.read_text(), content_type='text/css'))
        self.page.goto(self.url, wait_until='networkidle')
        self.assertEqual(self.page.evaluate('typeof SB'), 'object')
        self.page.evaluate(FIXTURE)

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], 'Unexpected browser errors')
            self.assertEqual(self.failed_requests, [], 'Failed requests (check browser CA trust)')
        finally:
            self.context.close()

    def screenshot(self, name):
        if OPTIONS.artifacts:
            self.page.screenshot(path=str(OPTIONS.artifacts / f'{name}.png'))

    def assert_readable(self, selector, paper=False):
        elements = self.page.locator(selector)
        self.assertGreater(elements.count(), 0, selector)
        for element in elements.all():
            colors = element.evaluate("""el => {
              let parent=el;
              while(parent && getComputedStyle(parent).backgroundColor==='rgba(0, 0, 0, 0)')parent=parent.parentElement;
              return {fg:getComputedStyle(el).color,bg:parent?getComputedStyle(parent).backgroundColor:'rgb(255, 255, 255)'};
            }""")
            background = 'rgb(255, 255, 255)' if paper else colors['bg']
            self.assertGreaterEqual(contrast(colors['fg'], background), 4.5,
                                    f'{selector}: {colors}, contrast against {background}')

    def test_off_white_surfaces_and_home_actions_have_contrast(self):
        self.assertEqual(self.page.evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light')
        for selector in ['body', '#slides-wrap', '#s0', '#s14', '#s15', '#s16', '#s17', '#s18', '#s19']:
            self.assertEqual(self.page.locator(selector).evaluate('(e)=>getComputedStyle(e).backgroundColor'),
                             'rgb(246, 245, 241)', selector)
        for selector in ['.home-title', '.home-card-title', '.home-card-sub',
                         '#home-live-kpis .home-live-kpi-val', '#s0 .home-actions .top-btn',
                         '#home-date-from', '#home-date-to']:
            self.assert_readable(selector)

    def test_master_theme_works_inside_an_outer_browser_frame(self):
        from playwright.sync_api import expect
        # In-app browsers can frame the main dashboard; this is not the
        # dashboard's isolated Order Execution child and must switch locally.
        self.page.route('**/theme-host.html', lambda r: r.fulfill(
            body=f'<iframe id="browser-view" src="{self.url}" style="width:100%;height:950px"></iframe>',
            content_type='text/html'))
        self.page.goto(self.url + 'theme-host.html', wait_until='networkidle')
        dashboard = self.page.frames[1]
        dashboard.evaluate(FIXTURE)
        totals = dashboard.locator('#home-live-kpis .home-live-kpi-val').all_text_contents()
        toggle = dashboard.locator('#theme-toggle')
        toggle.click()
        expect(dashboard.locator('html')).to_have_attribute('data-theme', 'dark')
        self.assertEqual(dashboard.locator('body').evaluate('(e)=>getComputedStyle(e).backgroundColor'),
                         'rgb(16, 21, 30)')
        self.assertEqual(dashboard.locator('#home-live-kpis .home-live-kpi-val').all_text_contents(), totals)
        with dashboard.expect_navigation(wait_until='networkidle'):
            dashboard.evaluate('location.reload()')
        expect(dashboard.locator('html')).to_have_attribute('data-theme', 'dark')
        dashboard.evaluate(FIXTURE)
        # Its nested Order Execution view still follows the master.
        dashboard.evaluate('goSlide(16)')
        execution = dashboard.frame_locator('#order-execution-frame')
        expect(execution.locator('html')).to_have_attribute('data-theme', 'dark')
        execution.locator('#dark-btn').dispatch_event('click')
        expect(dashboard.locator('html')).to_have_attribute('data-theme', 'light')
        expect(execution.locator('html')).to_have_attribute('data-theme', 'light')

    def test_master_theme_switch_preserves_reports_and_survives_reload(self):
        from playwright.sync_api import expect
        before = self.page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN})')
        totals = self.page.locator('#home-live-kpis .home-live-kpi-val').all_text_contents()
        toggle = self.page.locator('#theme-toggle')
        toggle.click()
        self.assertEqual(toggle.get_attribute('aria-checked'), 'true')
        self.assertEqual(self.page.evaluate('localStorage.getItem("ekwl-dashboard-theme")'), 'dark')
        for selector in ['body', '#s0', '#s14', '#s15', '#s16', '#s17', '#s18', '#s19']:
            self.assertEqual(self.page.locator(selector).evaluate('(e)=>getComputedStyle(e).backgroundColor'),
                             'rgb(16, 21, 30)', selector)
        for selector in ['.home-title', '.home-card-title', '.home-card-sub',
                         '#home-live-kpis .home-live-kpi-val', '#home-live-kpis .home-quick-box > span',
                         '#s0 .home-actions .top-btn', '.home-live-panel-title', '#theme-toggle']:
            self.assert_readable(selector)
        self.assertEqual(self.page.locator('#home-live-kpis .home-live-kpi-val').all_text_contents(), totals)
        self.assertEqual(self.page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN})'), before)
        for width in [390, 768, 1440]:
            self.page.set_viewport_size({'width':width, 'height':1000})
            self.assertTrue(self.page.locator('#s0').evaluate('(e)=>e.scrollWidth<=e.clientWidth'), width)
        self.screenshot('master-dark-home')
        self.page.evaluate('goSlide(6)')
        self.page.locator('#s6 .range-line-chip').first.click()
        self.assert_readable('#s2-line-dialog-title, #s2-line-dialog p, #s2-line-dialog span')
        self.page.evaluate('goSlide(17)')
        self.page.locator('#ss-tab-tna').click()
        self.assert_readable('.ss-tna-bar-label, .ss-tna-bar-values, .ss-tna-legend span')
        self.page.evaluate('goSlide(4)')
        canvas = self.page.locator('#s4-chassis-canvas')
        dark = canvas.evaluate('(e)=>e.toDataURL()')
        toggle.click()
        self.assertNotEqual(canvas.evaluate('(e)=>e.toDataURL()'), dark)
        self.assertEqual(self.page.evaluate('JSON.stringify({data:DATA,daily:DAILY_PLAN})'), before)
        toggle.click()
        self.page.evaluate('goSlide(16)')
        child = self.page.frame_locator('#order-execution-frame')
        expect(child.locator('html')).to_have_attribute('data-theme', 'dark')
        self.assertEqual(child.locator('body').evaluate('(e)=>getComputedStyle(e).backgroundColor'), 'rgb(16, 21, 30)')
        # The existing embedded theme button now switches the whole system too.
        child.locator('#dark-btn').dispatch_event('click')
        expect(self.page.locator('html')).to_have_attribute('data-theme', 'light')
        expect(child.locator('html')).to_have_attribute('data-theme', 'light')
        toggle.click()
        self.page.reload(wait_until='networkidle')
        self.page.evaluate(FIXTURE)
        expect(toggle).to_have_attribute('aria-checked', 'true')
        self.page.emulate_media(media='print')
        self.assertEqual(self.page.evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light')
        self.assert_readable('#home-live-kpis .home-quick-box > span', paper=True)
        self.page.emulate_media(media='screen')
        toggle.click()

    def test_range_categories_remain_distinct_in_normal_striped_and_hover_states(self):
        self.page.evaluate('goSlide(6)')
        for state in ['normal', 'hover-low', 'hover-high']:
            if state != 'normal':
                self.page.locator(f'#s6 .range-{state.removeprefix("hover-")}').first.hover()
            low = self.page.locator('#s6 tr.range-low td')
            high = self.page.locator('#s6 tr.range-high td')
            low_colors = {el.evaluate('(e)=>getComputedStyle(e).backgroundColor') for el in low.all()}
            high_colors = {el.evaluate('(e)=>getComputedStyle(e).backgroundColor') for el in high.all()}
            self.assertEqual(len(low_colors), 1, state)
            self.assertEqual(len(high_colors), 1, state)
            self.assertTrue(low_colors.isdisjoint(high_colors), state)
            low_rgb, high_rgb = rgb(next(iter(low_colors))), rgb(next(iter(high_colors)))
            self.assertGreater(low_rgb[2], low_rgb[1], 'Low category remains blue')
            self.assertGreater(high_rgb[1], high_rgb[2], 'High category remains green')
            self.assert_readable('#s6 tr.range-low td, #s6 tr.range-high td')
        self.screenshot('range-categories')
        # Legacy Plan Qty table also contains row-spanning summary cells.
        self.page.evaluate('goSlide(2)')
        for category in ['low', 'high']:
            colors = self.page.locator(f'#s2 tr.range-{category} td').evaluate_all(
                '(els)=>els.map(e=>getComputedStyle(e).backgroundColor)')
            self.assertEqual(len(set(colors)), 1, f'Legacy {category} summary cells')

    def test_feeding_totals_remain_visible_in_both_themes_and_filters(self):
        self.page.evaluate("""() => {
          const extra={...DATA[0],record_id:4,line:3,planqty:500};
          DATA.push(extra);DAILY_PLAN.push({record_id:4,line:3,ewo:extra.ewo,style:extra.style,color:extra.color,date:extra.startdate,value:500});
          goSlide(6);
        }""")
        foot = self.page.locator('#s6-feeding-foot td')
        for theme in ['light', 'dark']:
            if self.page.evaluate('EKWLTheme.get()') != theme:
                self.page.locator('#theme-toggle').click()
            self.page.locator('#s6-feeding-filter').select_option('')
            self.assertEqual(foot.all_text_contents(), ['Total Run EWO', '2', '3', '100.0%', ''])
            self.assert_readable('#s6-feeding-foot td, #s6-foot td')
            self.page.locator('#s6-feeding-foot').hover()
            self.assert_readable('#s6-feeding-foot td')
            if OPTIONS.artifacts:
                self.page.locator('#s6-feeding-tbl').screenshot(path=str(OPTIONS.artifacts / ('feeding-totals-' + theme + '.png')))
            self.page.locator('#s6-feeding-filter').select_option('2')
            self.assertEqual(foot.all_text_contents(), ['Total Run EWO', '1', '2', '100.0%', ''])
            self.assert_readable('#s6-feeding-foot td')
            self.page.locator('#s6-feeding-filter').select_option('')
        self.page.locator('#s6-order-range-filter').select_option('0')
        self.assertEqual(foot.all_text_contents(), ['Total Run EWO', '0', '0', '0.0%', ''])
        self.assert_readable('#s6-feeding-foot td')
        self.page.emulate_media(media='print')
        self.assert_readable('#s6-feeding-foot td', paper=True)

    def test_order_distribution_panel_and_center_follow_both_themes(self):
        self.page.evaluate('goSlide(6)')
        panel = self.page.locator('#s6-range-pie')
        donut = panel.locator('.s2-top-donut')
        values = panel.inner_text()
        series = donut.evaluate('(e)=>e.style.background')
        for theme in ['light', 'dark']:
            if self.page.evaluate('window.EKWLTheme.get()') != theme:
                self.page.locator('#theme-toggle').click()
            surface = self.page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--card").trim()')
            for selector in ['#s6-range-pie', '#s6-range-pie .s2-top-hole']:
                self.assertEqual(self.page.locator(selector).evaluate(
                    '(e)=>getComputedStyle(e).backgroundColor'),
                    self.page.evaluate('(color)=>{const e=document.createElement("div");e.style.color=color;document.body.append(e);const rgb=getComputedStyle(e).color;e.remove();return rgb}', surface))
            self.assert_readable('#s6-range-pie .s2-top-pie-title, #s6-range-pie .s2-top-hole b, '
                                 '#s6-range-pie .s2-top-hole span, #s6-range-pie .s2-top-legend strong')
            for element in panel.locator('.s2-top-hole b, .s2-top-hole span').all():
                self.assertEqual(element.evaluate('(e)=>getComputedStyle(e).textShadow'), 'none')
            self.assertEqual(panel.inner_text(), values)
            self.assertEqual(donut.evaluate('(e)=>e.style.background'), series)
            if OPTIONS.artifacts:
                panel.screenshot(path=str(OPTIONS.artifacts / ('order-distribution-' + theme + '.png')))
        self.page.emulate_media(media='print')
        self.assert_readable('#s6-range-pie .s2-top-hole b, #s6-range-pie .s2-top-hole span, '
                             '#s6-range-pie .s2-top-legend strong', paper=True)

    def test_priority_hit_percentages_and_counts_have_contrast(self):
        self.page.evaluate('goSlide(10)')
        self.assert_readable('.s9-hit-center b, .s9-hit-center span, .s9-hit-legend b')
        self.screenshot('priority-hit')

    def test_size_set_tna_labels_and_colored_pie_details_have_contrast(self):
        self.page.evaluate('goSlide(17)')
        self.page.locator('#ss-tab-tna').click()
        self.assertEqual(self.page.locator('.ss-tna-bar-row').count(), 12)
        self.assert_readable('.ss-tna-chart h3, .ss-tna-bar-label, .ss-tna-bar-values, '
                             '.ss-tna-legend span, #ss-tna-pie-detail strong, '
                             '#ss-tna-pie-detail span, #ss-tna-table > h3')
        self.assertEqual(self.page.locator('#ss-tna-kpis .kpi-val').all_text_contents(),
                         ['3', '2', '1', '66.7%'])
        self.screenshot('size-set-tna')

    def test_line_details_heading_has_contrast(self):
        self.page.evaluate('goSlide(6)')
        self.page.locator('#s6 .range-line-chip').first.click()
        self.assertTrue(self.page.locator('#s2-line-dialog').is_visible())
        self.assert_readable('#s2-line-dialog-title, #s2-line-dialog .s2-line-kpis strong, '
                             '#s2-line-dialog p, #s2-line-dialog .s2-line-kpis span')
        self.screenshot('line-details')
        self.page.locator('.s2-dialog-close').click()
        self.page.locator('#s2-line-dialog').wait_for(state='detached')

    def test_print_surfaces_and_headings_work_without_background_graphics(self):
        self.page.evaluate('goSlide(10); renderS1(DATA); renderSizeSetModule();showSizeSetSub("tna")')
        self.page.emulate_media(media='print')
        self.assertEqual(self.page.evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light')
        self.assertEqual(set(self.page.locator('.slide').evaluate_all(
            '(els)=>els.map(e=>getComputedStyle(e).position)')), {'static'})
        for selector in ['html', 'body', '#slides-wrap', '#s9', '#s1']:
            self.assertEqual(self.page.locator(selector).evaluate('(e)=>getComputedStyle(e).backgroundColor'),
                             'rgb(255, 255, 255)', selector)
        for selector in ['.slide-title', '.slide-subtitle', '.card-title', '.s9-analysis-title',
                         '.s9-hit-center b', '.s9-hit-legend b', '.kpi-lbl', '.kpi-val',
                         '.kpi-sub', '.ss-tna-chart h3', '.ss-tna-bar-label', '.ss-tna-bar-values',
                         '.ss-tna-legend span', '#ss-tna-pie-detail strong', '#ss-tna-pie-detail span',
                         '.home-title', '.home-card-title', '.home-card-sub']:
            self.assert_readable(selector, paper=True)
        # Include both neutral stripes and semantic rows when backgrounds print.
        self.page.evaluate('renderS6(DATA)')
        for selector in ['#s1-body td', '#s1-foot td', '#s6 .qty-range-ref td']:
            self.assert_readable(selector)
            self.assert_readable(selector, paper=True)
        self.assert_readable('#s1-line-filter, #s1-ewo-search, #s1 .pg-btn, #s0 .home-actions .top-btn')
        if OPTIONS.artifacts:
            for backgrounds in [False, True]:
                self.page.pdf(path=str(OPTIONS.artifacts / f'print-backgrounds-{backgrounds}.pdf'),
                              print_background=backgrounds)

    def test_filters_exports_permissions_logout_and_responsive_layout(self):
        self.assertEqual(self.page.locator('#home-live-kpis .home-live-kpi-val').nth(0).inner_text(), '11,000')
        self.page.locator('#home-date-from').fill('2026-10-02')
        self.page.locator('#home-date-from').dispatch_event('change')
        self.assertEqual(self.page.locator('#home-live-kpis .home-live-kpi-val').nth(1).inner_text(), '1,500')
        self.page.locator('.home-live-date-controls button').click()
        self.assertEqual(self.page.locator('#home-live-kpis .home-live-kpi-val').nth(1).inner_text(), '3,500')
        self.page.evaluate('goSlide(1)')
        self.page.locator('#s1-line-filter').select_option('1')
        self.assertEqual(self.page.locator('#s1-body tr').count(), 2)
        self.assertEqual(self.page.locator('#s1-kpi .kpi-val').nth(2).inner_text(), '5,000')
        self.page.locator('#s1-ewo-search').fill('B200')
        self.assertEqual(self.page.locator('#s1-body tr').count(), 0)
        self.page.evaluate('clearOrderFilters()')
        self.assertEqual(self.page.locator('#s1-body tr').count(), 3)
        self.page.locator('#s1-body td.hoverable').first.hover()
        self.assertTrue(self.page.locator('#order-hover').is_visible())
        for function, filename in [('downloadTemplate', 'production_planning_template.csv'),
                                   ('exportData', 'planning_export.csv')]:
            with self.page.expect_download() as event:
                self.page.evaluate(function+'()')
            self.assertEqual(event.value.suggested_filename, filename)
            contents = Path(event.value.path()).read_text()
            if function == 'exportData':
                self.assertEqual(len(contents.splitlines()), 4)
                self.assertIn('A100', contents)
                self.assertIn('B200', contents)
        self.page.evaluate('goSlide(17)')
        self.page.locator('#ss-tab-tna').click()
        self.page.locator('#ss-tna-month').select_option('10')
        self.page.locator('#ss-tna-event').select_option('PP Comment')
        self.assertEqual(self.page.locator('#ss-tna-kpis .kpi-val').all_text_contents(), ['2', '2', '0', '100.0%'])
        self.page.locator('#ss-tna-from').select_option('2')
        self.assertEqual(self.page.locator('#ss-tna-kpis .kpi-val').all_text_contents(), ['1', '1', '0', '100.0%'])
        for width in [1920, 1440, 1280, 768, 390]:
            self.page.set_viewport_size({'width':width, 'height':900})
            for slide in [0, 1, 6, 17]:
                self.page.evaluate(f'goSlide({slide})')
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width)
                self.assertTrue(self.page.locator('.slide.active').evaluate('(e)=>e.scrollWidth<=e.clientWidth'), (width, slide))
            self.screenshot(f'tna-{width}')
        self.page.evaluate("SITE_USER_PROFILE={role:'user',permissions:{slide_1:true}};applySitePermissions();goSlide(3)")
        self.assertEqual(self.page.evaluate('CURRENT_SLIDE'), 0)
        self.page.evaluate('siteLogout()')
        self.assertTrue(self.page.locator('#site-login-btn').is_visible())
        self.assertEqual(self.page.evaluate('DATA.length'), 0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', default=shutil.which('chromium') or shutil.which('google-chrome'))
    parser.add_argument('--baseline-css', type=Path)
    parser.add_argument('--artifacts', type=Path)
    OPTIONS, remaining = parser.parse_known_args()
    unittest.main(argv=[__file__, *remaining], verbosity=2)
