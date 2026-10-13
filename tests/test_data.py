import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.camps = json.loads((ROOT / "data" / "camps.json").read_text(encoding="utf-8"))
        cls.trails = json.loads((ROOT / "data" / "trails.json").read_text(encoding="utf-8"))

    def test_expected_coverage(self):
        paid = [camp for camp in self.camps if camp["paid"]]
        free = [camp for camp in self.camps if not camp["paid"]]
        self.assertGreaterEqual(len(paid), 15)
        self.assertGreaterEqual(len(free), 80)
        self.assertGreaterEqual(len(self.trails), 200)
        self.assertTrue(all(camp["lat"] for camp in paid))
        self.assertTrue(all(camp["regions"] for camp in self.camps))

    def test_trail_labels_stay_in_the_known_set(self):
        for trail in self.trails:
            self.assertIn(trail["difficulty"], {None, "easy", "moderate", "challenging"})
            self.assertIn(trail["circular"], {None, True, False, "partial"})
            self.assertNotIn("אופני", trail["name"])
            self.assertNotRegex(trail["name"], r"4\s*[xX×]\s*4")

    def test_nearby_points_at_real_hikes(self):
        ids = {trail["id"] for trail in self.trails}
        linked = 0
        for camp in self.camps:
            for near in camp["nearby"]:
                self.assertIn(near["id"], ids)
                linked += 1
        self.assertGreater(linked, 100)

    def test_catalog_does_not_store_a_price(self):
        places = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
        for row in self.camps + self.trails + places:
            self.assertNotIn("prices", row, row.get("name"))
            self.assertNotIn("priceFrom", row, row.get("name"))

    def test_day_hike_lines_stay_a_walkable_length(self):
        from scripts.osm_routes import route_length_km

        drawn = 0
        for trail in self.trails:
            for route in trail.get("routes") or []:
                drawn += 1
                length = route_length_km(route["lines"])
                self.assertGreaterEqual(length, 0.4, trail["name"])
                self.assertLessEqual(length, 14.05, trail["name"])
                self.assertNotIn("אופני", route["name"])
        self.assertGreater(drawn, 40)

    def test_paid_camps_link_to_the_reservation_tab(self):
        for camp in self.camps:
            if camp["paid"]:
                self.assertTrue(camp["bookingUrl"].startswith("https://www.parks.org.il/camping/"), camp["name"])
                self.assertTrue(camp["bookingUrl"].endswith("#8"), camp["name"])
                self.assertTrue(camp["bookingUrl"].startswith(camp["url"].split("#")[0]), camp["name"])
            else:
                self.assertEqual(camp["bookingUrl"], "")

    def test_pages_keep_factual_detail(self):
        paid = [camp for camp in self.camps if camp["paid"]]
        free = [camp for camp in self.camps if not camp["paid"]]
        self.assertTrue(all(camp["details"]["sections"] for camp in paid))
        described = [
            camp for camp in free
            if camp["details"].get("summary") or camp["details"].get("sections")
        ]
        self.assertGreater(len(described), 80)
        self.assertTrue(all(trail.get("details") for trail in self.trails))

    def test_field_photos_cover_camps_and_trails(self):
        camps_with_several = sum(len(camp.get("photos") or []) >= 2 for camp in self.camps)
        trails_with_photos = sum(bool(trail.get("photos")) for trail in self.trails)
        self.assertGreater(camps_with_several, 40)
        self.assertGreater(trails_with_photos, 200)
        for row in self.camps + self.trails:
            for photo in row.get("photos") or []:
                src = photo["src"]
                self.assertTrue(
                    src.startswith("https://www.parks.org.il/") or src.startswith("https://www.teva.org.il/"),
                    src,
                )
                self.assertRegex(src, r"\.(?:jpe?g|png|webp)(?:$|\?)", src)
                self.assertIsInstance(photo.get("credit"), str)
                self.assertNotIn("מפת", src)

    def test_places_are_named_points_near_israel(self):
        places = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
        kinds = {"spring", "waterfall", "viewpoint", "peak", "park", "reserve", "beach", "cart"}
        self.assertGreater(len(places), 100)
        seen = set()
        for place in places:
            self.assertIn(place["kind"], kinds)
            self.assertIn(place["source"], {"inpa", "osm", "coffeetrail"})
            self.assertGreaterEqual(place["lat"], 29.4)
            self.assertLessEqual(place["lat"], 33.4)
            self.assertGreaterEqual(place["lng"], 34.2)
            self.assertLessEqual(place["lng"], 35.95)
            self.assertTrue(place["name"])
            self.assertNotIn(place["id"], seen)
            seen.add(place["id"])
            if place["source"] == "inpa":
                self.assertIn("parks.org.il", place["url"])
            elif place["source"] == "coffeetrail":
                self.assertIn("coffeetrail.co.il/coffeecart/", place["url"])
            else:
                self.assertIn("openstreetmap.org", place["url"])
        self.assertIn("spring", {place["kind"] for place in places})
        self.assertIn("park", {place["kind"] for place in places})
        carts = [place for place in places if place["kind"] == "cart"]
        trail = [cart for cart in carts if cart["source"] == "coffeetrail"]
        osm_carts = [cart for cart in carts if cart["source"] == "osm"]
        self.assertGreaterEqual(len(trail), 300)
        self.assertGreaterEqual(len(osm_carts), 1)
        for cart in osm_carts:
            self.assertIn("עגל", cart["name"])
        hai = next(place for place in places if place["id"] == "r1877")
        self.assertTrue(hai["paid"])
        self.assertIn("חיות בר", hai["tags"])
        self.assertTrue(hai["booking"])
        self.assertGreaterEqual(len(hai["photos"]), 1)
        self.assertTrue(hai["photos"][0]["src"].startswith("https://www.parks.org.il/"))
        viewpoints = [place for place in places if place["kind"] == "viewpoint"]
        photographed = [place for place in viewpoints if place.get("photos")]
        self.assertGreater(len(photographed), 300)
        for place in viewpoints:
            self.assertIn("openstreetmap.org", place["url"])
        cliff = next(place for place in viewpoints if place["id"] == "o833181797")
        self.assertGreaterEqual(len(cliff["photos"]), 1)
        self.assertTrue(cliff["photos"][0]["src"].startswith("https://"))
        self.assertIn("wikimedia.org", cliff["photos"][0]["src"])
        self.assertTrue(cliff["photos"][0]["credit"])
        galim = next(place for place in viewpoints if place["id"] == "o11454119276")
        self.assertIn("openstreetmap.org/node/11454119276", galim["url"])
        self.assertIsNone(hai["hoursMax"])

    def test_recovered_walks_stay_in_the_catalog(self):
        ids = {trail["id"] for trail in self.trails}
        self.assertTrue({295240, 147488, 6070}.issubset(ids))

    def test_tiuli_facts_join_the_inpa_catalog(self):
        added = [trail for trail in self.trails if 8_000_000 <= int(trail["id"]) < 20_000_000]
        linked = [trail for trail in self.trails if trail.get("tiuliUrl") and int(trail["id"]) < 8_000_000]
        self.assertGreaterEqual(len(added), 150)
        self.assertGreaterEqual(len(linked), 30)
        for trail in added:
            self.assertTrue(trail["tiuliUrl"].startswith("https://www.tiuli.com/tracks/"), trail["name"])
            self.assertEqual(trail.get("url") or "", "")
            self.assertEqual(trail.get("blurb") or "", "")
            if trail.get("tevaUrl"):
                for photo in trail.get("photos") or []:
                    self.assertRegex(photo["src"], r"^https://www\.teva\.org\.il/.+\.(?:jpe?g|png|webp)$")
            else:
                self.assertFalse(trail.get("photos"))
            self.assertGreaterEqual(trail["lat"], 29.4)
            self.assertLessEqual(trail["lat"], 33.4)
            self.assertNotIn("אופני", trail["name"])
            self.assertNotRegex(trail["name"], r"ג['׳]יפ|4\s*[xX×]\s*4")
        added_teva = [trail for trail in self.trails if int(trail["id"]) >= 20_000_000]
        self.assertGreaterEqual(len(added_teva), 30)
        hazaka = next(trail for trail in self.trails if str(trail.get("tevaUrl") or "").endswith("/tracks/25113"))
        self.assertIn("חזקה", hazaka["name"])
        self.assertEqual(hazaka["lat"], 33.05387)
        self.assertEqual(hazaka["lng"], 35.85037)
        self.assertEqual(hazaka.get("blurb") or "", "")
        self.assertGreaterEqual(len(hazaka.get("photos") or []), 1)
        self.assertRegex(hazaka["photos"][0]["src"], r"^https://www\.teva\.org\.il/.+\.(?:jpe?g|png|webp)$")
        self.assertIsInstance(hazaka["photos"][0].get("credit"), str)
        linked_teva = [trail for trail in self.trails if trail.get("tevaUrl")]
        self.assertGreaterEqual(len(linked_teva), len(added_teva))
        for trail in linked_teva:
            self.assertTrue(trail["tevaUrl"].startswith("https://www.teva.org.il/tracks/"), trail["name"])
        for trail in added_teva:
            self.assertEqual(trail.get("source"), "teva")
            self.assertEqual(trail.get("blurb") or "", "")
            for photo in trail.get("photos") or []:
                self.assertRegex(photo["src"], r"^https://www\.teva\.org\.il/.+\.(?:jpe?g|png|webp)$")
                self.assertIsInstance(photo.get("credit"), str)
            if trail.get("lat") is not None:
                self.assertGreaterEqual(trail["lat"], 29.4)
                self.assertLessEqual(trail["lat"], 33.4)
                self.assertGreaterEqual(trail["lng"], 34.2)
                self.assertLessEqual(trail["lng"], 35.95)
        swiss = next(trail for trail in self.trails if trail["id"] == 62571)
        self.assertTrue(swiss["tiuliUrl"].startswith("https://www.tiuli.com/tracks/24/"))
        linked_camps = [camp for camp in self.camps if camp.get("tiuliUrl")]
        self.assertGreaterEqual(len(linked_camps), 40)
        for camp in linked_camps:
            self.assertTrue(camp["tiuliUrl"].startswith("https://www.tiuli.com/camping/"), camp["name"])
        places = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
        linked_places = [place for place in places if place.get("tiuliUrl")]
        self.assertGreaterEqual(len(linked_places), 40)
        for place in linked_places:
            self.assertTrue(place["tiuliUrl"].startswith("https://www.tiuli.com/"), place["name"])

    def test_family_signal_is_not_the_default_tag(self):
        family = sum(1 for trail in self.trails if trail["family"])
        self.assertGreater(family, 20)
        self.assertLess(family / len(self.trails), 0.55)


if __name__ == "__main__":
    unittest.main()
