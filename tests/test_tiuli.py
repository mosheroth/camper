import unittest

from scripts.fetch_tiuli import TIULI_BASE, merge_catalog, parse_page

SAMPLE = """
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"TouristAttraction","geo":{"@type":"GeoCoordinates","latitude":"32.74","longitude":"35.02"},"name":"נחל כלח","url":"https://www.tiuli.com/tracks/24/-4"}
</script>
<nav><ul class="breadcrumb">
<li><span itemprop="name">אתר</span></li>
<li><span itemprop="name">מסלולי טיול</span></li>
<li><span itemprop="name">צפון</span></li>
<li><span itemprop="name">חיפה והר הכרמל</span></li>
<li class="active"><span itemprop="name">נחל כלח</span></li>
</ul></nav>
<span>רמת קושי</span></div><span>בינוני, 8 ק&quot;מ</span>
<a href="https://www.tiuli.com/tracks?features=21"><span class="icon-round icon"></span>מעגלי</a>
<a href="https://www.tiuli.com/tracks?features=16"><span class="icon-family icon"></span>מתאים למשפחות</a>
"""


class TiuliParseTests(unittest.TestCase):
    def test_track_page_keeps_facts_without_the_article(self):
        record = parse_page(SAMPLE, "tracks")
        self.assertEqual(record["id"], 24)
        self.assertEqual(record["name"], "נחל כלח")
        self.assertEqual(record["url"], "https://www.tiuli.com/tracks/24/-4")
        self.assertAlmostEqual(record["lat"], 32.74)
        self.assertEqual(record["difficulty"], "moderate")
        self.assertEqual(record["kmMax"], 8)
        self.assertIs(record["circular"], True)
        self.assertTrue(record["family"])
        self.assertEqual(record["region"], "north")
        self.assertEqual(record["area"], "חיפה והר הכרמל")
        self.assertNotIn("description", record)


class TiuliMergeTests(unittest.TestCase):
    def test_same_hike_is_linked_and_a_new_one_is_added(self):
        known = parse_page(SAMPLE, "tracks")
        payload = {
            "tracks": [
                known,
                {
                    "id": 99,
                    "name": "אופניים בנחל כלח",
                    "url": "https://www.tiuli.com/tracks/99/bike",
                    "lat": 32.74,
                    "lng": 35.02,
                    "hike": False,
                    "features": ["אופניים"],
                    "region": "north",
                    "area": "כרמל",
                    "difficulty": "easy",
                    "difficulties": ["easy"],
                    "kmMin": 5,
                    "kmMax": 5,
                    "circular": None,
                    "family": False,
                    "accessible": False,
                },
                {
                    "id": 100,
                    "name": "נחל גלים",
                    "url": "https://www.tiuli.com/tracks/100/galim",
                    "lat": 32.75,
                    "lng": 35.03,
                    "hike": True,
                    "features": ["מעגלי"],
                    "region": "north",
                    "area": "כרמל",
                    "difficulty": "easy",
                    "difficulties": ["easy"],
                    "kmMin": 3,
                    "kmMax": 3,
                    "circular": True,
                    "family": False,
                    "accessible": False,
                },
            ],
            "camping": [{
                "id": 5,
                "name": "חניון לילה חוות משמר הכרמל",
                "url": "https://www.tiuli.com/camping/5/carmel",
                "lat": 32.746,
                "lng": 35.003,
            }],
            "points": [{
                "id": 7,
                "name": "עין קדם",
                "url": "https://www.tiuli.com/points-of-interest/7/kedem",
                "lat": 32.7402,
                "lng": 35.0102,
            }],
            "attractions": [],
        }
        trails = [{
            "id": 1,
            "name": "נחל כלח עילי",
            "lat": 32.741,
            "lng": 35.021,
            "family": False,
            "url": "https://www.parks.org.il/trip/kelah/",
            "areas": [],
        }]
        camps = [{
            "id": 9,
            "name": "חניון לילה חוות משמר הכרמל",
            "lat": 32.745,
            "lng": 35.002,
            "regions": ["north"],
            "areas": [],
        }]
        places = [{
            "id": "o1",
            "name": "עין קדם",
            "lat": 32.74,
            "lng": 35.01,
            "kind": "spring",
            "source": "osm",
            "url": "https://www.openstreetmap.org/node/1",
        }]
        trails, camps, places, stats = merge_catalog(trails, camps, places, payload)
        self.assertEqual(stats["linkedTrails"], 1)
        self.assertEqual(stats["addedTrails"], 1)
        self.assertEqual(trails[0]["tiuliUrl"], "https://www.tiuli.com/tracks/24/-4")
        self.assertEqual(trails[0]["url"], "https://www.parks.org.il/trip/kelah/")
        added = trails[1]
        self.assertEqual(added["id"], TIULI_BASE + 100)
        self.assertEqual(added["url"], "")
        self.assertEqual(added["blurb"], "")
        self.assertEqual(added["photos"], [])
        self.assertTrue(added["hoursEstimated"])
        self.assertEqual(added["tiuliUrl"], "https://www.tiuli.com/tracks/100/galim")
        self.assertEqual(camps[0]["tiuliUrl"], "https://www.tiuli.com/camping/5/carmel")
        self.assertEqual(places[0]["tiuliUrl"], "https://www.tiuli.com/points-of-interest/7/kedem")
        self.assertEqual(places[0]["url"], "https://www.openstreetmap.org/node/1")
        self.assertTrue(any(near["id"] == added["id"] for near in camps[0]["nearby"]))


if __name__ == "__main__":
    unittest.main()
