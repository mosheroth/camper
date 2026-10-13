import unittest

from scripts.fetch_teva import clean_name, linked_track_ids, merge_teva, parse_track, published_pin

HAZAKA = """
<meta property="og:title" content="מסלול טיול בתל חזקה | החברה להגנת הטבע">
<meta property="og:image" content="https://www.teva.org.il/app/uploads/2023/03/shutterstock_719164924.jpg" />
<ul class="trip-info">
<li class="trip-aud"><div class="img-wrap"></div><div class="info-wrap"><span>למי</span><span>משפחות, חובבי לכת</span></div></li>
<li class="trip-len"><div class="img-wrap"></div><div class="info-wrap"><span>אורך</span><span>4 ק״מ במסלול קווי עם הקפצת רכב</span></div></li>
<li class="trip-dur"><div class="img-wrap"></div><div class="info-wrap"><span>זמן</span><span>2-3 שעות</span></div></li>
<li class="trip-diff"><div class="img-wrap"></div><div class="info-wrap"><span>קושי</span><span>בינונית</span></div></li>
</ul>
<a href="https://waze.com/ul?ll=33.05387000%2C35.85036600&amp;navigate=yes">הר חוזק</a>
<img class="brand__logo" src="https://www.teva.org.il/app/themes/teva/dist/images/icons/logo.svg" width="54" height="96" alt="החברה להגנת הטבע">
<figure>
<img src="https://www.teva.org.il/app/uploads/2023/03/shutterstock_719164924.jpg" alt="הר בנטל" width="1670" height="648">
<figcaption>הר בנטל והר אביטל ברמת הגולן. צילום: שאטרסטוק</figcaption>
</figure>
<a class="gallery-img-holder" href="https://www.teva.org.il/app/uploads/2023/03/golan-scaled.jpg">
<img class="gallery-img" width="1024" height="768" data-lazy-src="https://www.teva.org.il/app/uploads/2023/03/golan-1024x768.jpg" alt="נוף">
</a>
<img class="share-icon" width="24" height="24" src="https://www.teva.org.il/app/themes/teva/dist/images/icons/icon-facebook.svg">
<img src="https://www.teva.org.il/app/uploads/2024/11/spni-icon-modals-1.svg" width="36" height="35" alt="">
<section class="news-carousel">
<img class="news-thumb" width="1920" height="1080" src="https://www.teva.org.il/app/uploads/2022/01/other-story.jpg" alt="כתבה אחרת">
</section>
"""

NO_PIN = """
<meta property="og:title" content="מסלול טיול בנחל דמו | החברה להגנת הטבע">
<li class="trip-len"><div class="img-wrap"></div><div class="info-wrap"><span>אורך</span><span>6 ק"מ במסלול מעגלי</span></div></li>
<li class="trip-dur"><div class="img-wrap"></div><div class="info-wrap"><span>זמן</span><span>שעתיים</span></div></li>
<li class="trip-diff"><div class="img-wrap"></div><div class="info-wrap"><span>קושי</span><span>קלה</span></div></li>
<li class="trip-aud"><div class="img-wrap"></div><div class="info-wrap"><span>למי</span><span>מטיילים</span></div></li>
<p>הטקסט של הכתבה לא נשמר.</p>
"""

BIKE = """
<meta property="og:title" content="מסלול אופניים בכרמל | החברה להגנת הטבע">
<li class="trip-len"><div class="img-wrap"></div><div class="info-wrap"><span>אורך</span><span>12 ק"מ</span></div></li>
"""


class TevaParseTests(unittest.TestCase):
    def test_hazaka_keeps_the_published_pin_and_drops_the_article(self):
        record = parse_track(HAZAKA, 25113)
        self.assertEqual(record["name"], "תל חזקה")
        self.assertEqual(record["url"], "https://www.teva.org.il/tracks/25113")
        self.assertEqual(record["lat"], 33.05387)
        self.assertEqual(record["lng"], 35.85037)
        self.assertEqual(record["kmMin"], 4)
        self.assertEqual(record["kmMax"], 4)
        self.assertEqual(record["hoursMin"], 2)
        self.assertEqual(record["hoursMax"], 3)
        self.assertEqual(record["difficulty"], "moderate")
        self.assertIs(record["circular"], False)
        self.assertTrue(record["family"])
        self.assertNotIn("כתבה", record["name"])
        self.assertEqual([photo["src"] for photo in record["photos"]], [
            "https://www.teva.org.il/app/uploads/2023/03/shutterstock_719164924.jpg",
            "https://www.teva.org.il/app/uploads/2023/03/golan-1024x768.jpg",
        ])
        self.assertIn("שאטרסטוק", record["photos"][0]["credit"])
        self.assertTrue(record["photos"][0]["src"].startswith("https://"))
        self.assertRegex(record["photos"][0]["src"], r"\.(?:jpe?g|png|webp)$")

    def test_a_page_without_a_pin_stays_unpinned(self):
        record = parse_track(NO_PIN, 9)
        self.assertIsNone(record["lat"])
        self.assertIsNone(record["lng"])
        self.assertEqual(record["name"], "נחל דמו")
        self.assertEqual(record["photos"], [])
        self.assertIs(record["circular"], True)
        self.assertEqual(published_pin("<path d='M 32.1 35.2'/>"), None)

    def test_a_bike_page_is_not_a_walk(self):
        self.assertIsNone(parse_track(BIKE, 3))

    def test_a_walk_that_mentions_a_jeep_option_stays(self):
        page = """
        <title>קניון נחל ברק | החברה להגנת הטבע</title>
        <li class="trip-len"><div class="img-wrap"></div><div class="info-wrap"><span>אורך</span><span>הקניון עצמו - כ-1 ק"מ. אפשר גם לחצות ברכב שטח</span></div></li>
        """
        record = parse_track(page, 837165)
        self.assertEqual(record["name"], "קניון נחל ברק")
        self.assertEqual(record["kmMin"], 1)

    def test_waze_live_map_pin_and_the_document_title(self):
        page = """
        <title>מג&#039;יסר א-זרקא לקיסריה | החברה להגנת הטבע</title>
        <meta property="og:title" content="הליכה בין חופים יפהפיים עם נקודות להתרעננות בחוף הים, הכרות עם כפר הדייגים היחיד בארץ ואמת מים גדולה ומרשימה.">
        <a href="https://www.waze.com/en-GB/live-map/directions?to=ll.32.75151,35.04761">ניווט</a>
        """
        self.assertEqual(published_pin(page), (32.75151, 35.04761))
        record = parse_track(page, 10400)
        self.assertEqual(record["name"], "מג'יסר א-זרקא לקיסריה")
        self.assertEqual(record["lat"], 32.75151)

    def test_site_suffix_is_stripped(self):
        self.assertEqual(clean_name("נחל אורן | החברה להגנת הטבע"), "נחל אורן")

    def test_a_news_post_is_not_a_walk_point(self):
        page = "<title>איפה אפשר לראות שטפונות? | החברה להגנת הטבע</title><p>כתבה</p>"
        self.assertIsNone(parse_track(page, 22461))
        self.assertEqual(linked_track_ids('href="https://www.teva.org.il/news/tracks/22461"'), set())
        self.assertEqual(linked_track_ids('href="/tracks/25113"'), {25113})


class TevaMergeTests(unittest.TestCase):
    def test_new_walk_is_added_and_the_same_name_is_linked(self):
        trails = [{
            "id": 100,
            "name": "תל חזקה",
            "lat": 33.05,
            "lng": 35.85,
            "regions": ["north"],
            "areas": [],
        }]
        camps = [{"id": 1, "lat": 33.05, "lng": 35.85, "areas": [], "nearby": []}]
        records = [
            {
                "id": 25113,
                "name": "תל חזקה",
                "url": "https://www.teva.org.il/tracks/25113",
                "lat": 33.05387,
                "lng": 35.85037,
                "kmMin": 4,
                "kmMax": 4,
                "hoursMin": 2,
                "hoursMax": 3,
                "difficulty": "moderate",
                "difficulties": ["moderate"],
                "circular": False,
                "family": True,
                "accessible": False,
                "photos": [{
                    "src": "https://www.teva.org.il/app/uploads/2023/03/shutterstock_719164924.jpg",
                    "credit": "צילום: שאטרסטוק",
                }],
            },
            {
                "id": 9,
                "name": "נחל דמו",
                "url": "https://www.teva.org.il/tracks/9",
                "lat": None,
                "lng": None,
                "kmMin": 6,
                "kmMax": 6,
                "hoursMin": 2,
                "hoursMax": 2,
                "difficulty": "easy",
                "difficulties": ["easy"],
                "circular": True,
                "family": False,
                "accessible": False,
                "photos": [{
                    "src": "https://www.teva.org.il/app/uploads/2021/08/demo.jpg",
                    "credit": "",
                }],
            },
        ]
        merged, updated_camps, stats = merge_teva(trails, camps, records)
        hazaka = next(trail for trail in merged if trail["id"] == 100)
        self.assertEqual(hazaka["tevaUrl"], "https://www.teva.org.il/tracks/25113")
        self.assertEqual(hazaka["photos"][0]["src"], "https://www.teva.org.il/app/uploads/2023/03/shutterstock_719164924.jpg")
        self.assertEqual(hazaka["image"], hazaka["photos"][0]["src"])
        demo = next(trail for trail in merged if trail["name"] == "נחל דמו")
        self.assertEqual(demo["id"], 20_000_009)
        self.assertIsNone(demo["lat"])
        self.assertEqual(demo["source"], "teva")
        self.assertEqual(demo["blurb"], "")
        self.assertEqual(demo["photos"][0]["src"], "https://www.teva.org.il/app/uploads/2021/08/demo.jpg")
        self.assertRegex(demo["photos"][0]["src"], r"^https://.+\.(?:jpe?g|png|webp)$")
        self.assertFalse(demo["hoursEstimated"])
        self.assertEqual(demo["hoursMax"], 2)
        self.assertEqual(stats["linkedTrails"], 1)
        self.assertEqual(stats["addedTrails"], 1)
        self.assertTrue(any(near["id"] == 100 for near in updated_camps[0]["nearby"]))
        catalog = [{
            "id": 8000337,
            "name": "נחל זוהר",
            "lat": 31.1544,
            "lng": 35.35738,
            "regions": ["south"],
            "areas": [],
            "image": "https://www.parks.org.il/wp-content/uploads/zohar.jpg",
            "photos": [{"src": "https://www.parks.org.il/wp-content/uploads/zohar.jpg", "credit": "צילום: רשות"}],
        }]
        comma = {
            "id": 7878,
            "name": "נחל זוהר, קניון ליד ים המלח",
            "url": "https://www.teva.org.il/tracks/7878",
            "lat": None,
            "lng": None,
            "kmMin": 2,
            "kmMax": 2,
            "hoursMin": 2,
            "hoursMax": 2,
            "difficulty": "moderate",
            "difficulties": ["moderate"],
            "circular": None,
            "family": False,
            "accessible": False,
            "photos": [{"src": "https://www.teva.org.il/app/uploads/2023/03/zohar-teva.jpg", "credit": ""}],
        }
        again, _camps, stats = merge_teva(catalog, [], [comma])
        zohar = next(trail for trail in again if trail["name"] == "נחל זוהר")
        self.assertEqual(zohar["id"], 8000337)
        self.assertEqual(zohar["tevaUrl"], "https://www.teva.org.il/tracks/7878")
        self.assertEqual(zohar["photos"][0]["src"], "https://www.parks.org.il/wp-content/uploads/zohar.jpg")
        self.assertEqual(zohar["lat"], 31.1544)
        self.assertEqual(zohar["lng"], 35.35738)
        self.assertEqual(stats["linkedTrails"], 1)
        self.assertEqual(stats["addedTrails"], 0)
        self.assertFalse(any("קניון ליד" in trail["name"] for trail in again))
        other = dict(comma, id=99, name="נחל דוד, קניון אחר", url="https://www.teva.org.il/tracks/99")
        _kept, _camps, stats = merge_teva(catalog, [], [other])
        self.assertEqual(stats["addedTrails"], 1)
        self.assertEqual(stats["linkedTrails"], 0)
        far = dict(comma, lat=33.05, lng=35.85)
        _kept, _camps, stats = merge_teva(catalog, [], [far])
        self.assertEqual(stats["addedTrails"], 1)
        self.assertEqual(stats["linkedTrails"], 0)

    def test_a_previous_teva_row_is_replaced(self):
        stale = [{"id": 20_000_009, "name": "ישן", "lat": None, "lng": None, "regions": [], "areas": []}]
        records = [{
            "id": 9,
            "name": "נחל דמו",
            "url": "https://www.teva.org.il/tracks/9",
            "lat": None,
            "lng": None,
            "kmMin": None,
            "kmMax": None,
            "hoursMin": None,
            "hoursMax": None,
            "difficulty": None,
            "difficulties": [],
            "circular": None,
            "family": False,
            "accessible": False,
        }]
        merged, _camps, stats = merge_teva(stale, [], records)
        self.assertEqual([trail["name"] for trail in merged], ["נחל דמו"])
        self.assertTrue(merged[0]["hoursEstimated"] is False or merged[0]["hoursMax"] is None)
        self.assertEqual(stats["addedTrails"], 1)
