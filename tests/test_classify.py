import unittest

from scripts.fetch_places import hebrew_name, osm_kind, park_kind
from scripts.classify import (
    difficulties,
    is_family,
    is_hike,
    parse_hours,
    parse_km,
    plain_text,
    primary_difficulty,
    shape,
)
from scripts.fetch_inpa import price_from
from scripts.geo import haversine_km, itm_to_wgs84, region_from_lat
from scripts.match import nearby_trails


class ClassifyTests(unittest.TestCase):
    def test_plain_text_unescapes_markup(self):
        self.assertEqual(plain_text("<p>כ-5 ק&quot;מ</p>"), 'כ-5 ק"מ')

    def test_hours_from_labeled_range(self):
        text = plain_text("<p><strong>משך המסלול:</strong> 3-2 שעות</p>")
        self.assertEqual(parse_hours(text), (2.0, 3.0))

    def test_hours_hebrew_and_single(self):
        self.assertEqual(parse_hours("משך המסלול: כשעה"), (1.0, 1.0))
        self.assertEqual(parse_hours("משך המסלול: כשלוש שעות"), (3.0, 3.0))
        self.assertEqual(parse_hours("משך המסלול: 1.5-2.5 שעות"), (1.5, 2.5))

    def test_km_kilometer_word_and_range(self):
        self.assertEqual(parse_km("אורך המסלול: כקילומטר אחד"), (1.0, 1.0))
        self.assertEqual(parse_km('אורך המסלול: כ-3 ק"מ'), (3.0, 3.0))
        text = 'אורך המסלול: 4.5 ק"מ (עד המפל) 7 ק"מ (עד הבריכות) משך המסלול: 5-3 שעות'
        self.assertEqual(parse_km(text), (4.5, 7.0))
        self.assertEqual(parse_hours(text), (3.0, 5.0))

    def test_difficulty_prefers_words_over_flags(self):
        flags = {"easy_f": True, "challenging_f": False}
        levels = difficulties("בינונית, מעגלי", flags)
        self.assertEqual(levels, ["moderate"])
        self.assertEqual(primary_difficulty(difficulties("מטיבי לכת", {})), "challenging")
        self.assertEqual(difficulties("לא קשה, קל", {}), ["easy"])
        self.assertEqual(difficulties("לא קשה בכלל", {}), [])

    def test_difficulty_falls_back_to_flags(self):
        self.assertEqual(
            difficulties("נוף פתוח", {"easy_f": True, "moderate_f": False, "challenging_f": False}),
            ["easy"],
        )

    def test_shape(self):
        self.assertEqual(shape("מסלול מעגלי בחלקו", {}), "partial")
        self.assertIs(shape("קלה, מעגלי", {}), True)
        self.assertIs(shape("מסלול קווי", {"circular_f": True}), False)
        self.assertIs(shape("בלי תיאור", {"linear_f": True}), False)
        self.assertIsNone(shape("בלי תיאור", {}))

    def test_family_tag_or_word(self):
        self.assertTrue(is_family([976], "מסלול קצר"))
        self.assertTrue(is_family([], "מסלול משפחתי מפתיע"))
        self.assertFalse(is_family([4403], "מסלול ארוך למיטיבי לכת"))
        self.assertFalse(is_family([4438], "מסלול ארוך"))

    def test_price_from_uses_the_regular_adult_tent(self):
        rows = [
            {"label": "לינת שטח באוהלים פרטיים - מבוגר", "price": "64.00 ₪"},
            {"label": "לינת שטח באוהלים פרטיים - ילד", "price": "47.00 ₪"},
            {"label": "לינת שטח - מבוגר מטמון", "price": "48.00 ₪"},
        ]
        self.assertEqual(price_from(rows), 64)

    def test_vehicle_routes_are_not_hikes(self):
        self.assertFalse(is_hike("מסלול טיול באופניים לאורך הירקון"))
        self.assertFalse(is_hike("טיול ג'יפים בנחל תבור לרכבי 4X4"))
        self.assertFalse(is_hike("מסלול רכוב, עם גיחות ברגל"))
        self.assertFalse(is_hike("מסלול נסיעה ברכב שטח"))
        self.assertTrue(is_hike("מסלול מעגלי קל למשפחות"))
        self.assertTrue(is_hike("חזרה לרכב על תוואי שביל ישראל"))
        self.assertTrue(is_hike("יש לדאוג לרכב אוסף בסוף המסלול"))
        self.assertTrue(is_hike("אחד מהקרבות הרכובים האחרונים"))

    def test_place_names_stay_specific(self):
        self.assertEqual(hebrew_name({"name:he": "עין עברונה", "name": "Ein Avrona"}), "עין עברונה")
        self.assertIsNone(hebrew_name({"name": "Spring"}))
        self.assertIsNone(hebrew_name({"name:he": "מעיין"}))
        self.assertEqual(osm_kind({"natural": "spring", "tourism": "viewpoint"}), "spring")
        self.assertEqual(osm_kind({"waterway": "waterfall"}), "waterfall")
        self.assertEqual(osm_kind({"natural": "peak"}), "peak")
        self.assertEqual(park_kind("גן לאומי כורסי", {"National_Park_s": True}), "park")
        self.assertEqual(park_kind("שמורת טבע נחל עמוד", {}), "reserve")
        self.assertEqual(park_kind("חוף פלמחים", {"Beach_s": True}), "beach")

    def test_regions_follow_the_paid_camp_index(self):
        self.assertEqual(region_from_lat(32.55), "north")
        self.assertEqual(region_from_lat(31.66), "center")
        self.assertEqual(region_from_lat(31.31), "south")

    def test_itm_matches_a_published_waze_pin(self):
        lat, lng = itm_to_wgs84(195386.77, 471634.7)
        self.assertLess(haversine_km(lat, lng, 30.334046, 34.954136), 0.15)

    def test_nearby_uses_distance_and_infers_area(self):
        camp = {"id": 1, "lat": 32.55, "lng": 35.35, "areas": []}
        close = {"id": 10, "lat": 32.56, "lng": 35.36, "areas": [7]}
        same_area = {"id": 11, "lat": None, "lng": None, "areas": [7]}
        far = {"id": 12, "lat": 29.8, "lng": 34.9, "areas": [7]}
        linked = nearby_trails(camp, [close, same_area, far])
        ids = [item["id"] for item in linked]
        self.assertEqual(ids, [10, 11])
        self.assertLess(linked[0]["km"], 5)


if __name__ == "__main__":
    unittest.main()
