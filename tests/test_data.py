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

    def test_paid_price_is_the_adult_tent_on_the_card(self):
        for camp in self.camps:
            if not camp["paid"] or camp["priceFrom"] is None:
                continue
            adults = [
                row for row in camp["prices"]
                if "מבוגר" in row["label"] and "תוספת" not in row["label"] and "מטמון" not in row["label"]
            ]
            if not adults:
                continue
            amount = int(float(adults[0]["price"].split()[0]))
            self.assertEqual(camp["priceFrom"], amount, camp["name"])

    def test_family_signal_is_not_the_default_tag(self):
        family = sum(1 for trail in self.trails if trail["family"])
        self.assertGreater(family, 20)
        self.assertLess(family, 120)


if __name__ == "__main__":
    unittest.main()
