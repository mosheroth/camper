import unittest

from scripts.details import free_camp_details, list_items, route_snippet
from scripts.osm_routes import choose_groups, keep_line, match_score, simplify_line, specific_tokens


class RouteMatchTests(unittest.TestCase):
    def test_specific_tokens_skip_generic_words(self):
        tokens = specific_tokens("המלצה למסלול טיול בעין סהרונים ובנחל נקרות")
        self.assertIn("סהרונים", tokens)
        self.assertIn("נקרות", tokens)
        self.assertNotIn("מסלול", tokens)
        self.assertNotIn("נחל", tokens)
        self.assertNotIn("עין", tokens)
        self.assertNotIn("למסלול", specific_tokens("המלצה למסלול במכתש הגדול"))
        self.assertNotIn("במכתש", specific_tokens("המלצה למסלול במכתש הגדול"))

    def test_score_needs_a_specific_shared_name(self):
        tokens = specific_tokens("פרסת נקרות ועין סהרונים")
        self.assertGreaterEqual(match_score("רמת סהרונים", tokens), 4)
        self.assertEqual(match_score("שביל ישראל", tokens), 0)
        self.assertEqual(match_score("נחל אפור", tokens), 0)

    def test_choose_groups_a_relation_ahead_of_same_named_ways(self):
        tokens = specific_tokens("פרסת נקרות ועין סהרונים")
        elements = [
            {"type": "way", "id": 1, "tags": {"name": "פרסת נקרות", "highway": "path"}},
            {"type": "way", "id": 5, "tags": {"name": "פרסת נקרות", "highway": "path"}},
            {"type": "relation", "id": 2, "tags": {"name": "פרסת נקרות", "route": "hiking"}},
            {"type": "relation", "id": 3, "tags": {"name": "רמת סהרונים", "route": "hiking"}},
            {"type": "relation", "id": 4, "tags": {"name": "שביל ישראל", "route": "hiking"}},
            {"type": "way", "id": 8, "tags": {"name": "נחל לוץ", "highway": "path"}},
            {"type": "way", "id": 9, "tags": {"name": "נחל לוץ", "highway": "path"}},
        ]
        groups = choose_groups(elements, tokens + ["לוץ"])
        self.assertEqual([name for _score, name, _members in groups[:2]], ["פרסת נקרות", "רמת סהרונים"])
        self.assertEqual([item["id"] for item in groups[0][2]], [2])
        lutz = next(group for group in groups if group[1] == "נחל לוץ")
        self.assertEqual(sorted(item["id"] for item in lutz[2]), [8, 9])

    def test_simplify_keeps_ends_and_drops_tiny_steps(self):
        points = [(30.0, 34.0), (30.00001, 34.00001), (30.01, 34.01)]
        line = simplify_line(points, limit=10)
        self.assertEqual(line[0], [30.0, 34.0])
        self.assertEqual(line[-1], [30.01, 34.01])
        self.assertLess(len(line), 3)

    def test_keep_line_drops_a_stub_and_a_regional_circuit(self):
        stub = [[[30.0, 34.0], [30.001, 34.001]]]
        self.assertFalse(keep_line("בריכת ירושלים", stub))
        regional = []
        lat = 30.4
        for _ in range(8):
            regional.append([round(lat, 5), 34.8])
            lat += 0.05
        self.assertFalse(keep_line("סובב מכתש רמון", [regional]))
        day = [[[30.60, 34.93], [30.605, 34.94], [30.61, 34.95], [30.608, 34.945]]]
        self.assertTrue(keep_line("פרסת נקרות", day, hike_km=4.5))
        self.assertFalse(keep_line("שביל אופניים", day))

    def test_free_camp_page_keeps_the_practical_list_and_a_short_description(self):
        html = (
            "<p>חניון שלט, מתחם לינת שטח פתוח לקהל הרחב ללא תשלום</p>"
            "<h2>תיאור</h2><p>חניון הלילה שוכן בשטח שמורת טבע נחל עשוש, בין קניונים והרים.</p>"
            "<ul><li>מספר מקומות לינה: 200</li><li>הנחיות הגעה: על כביש 40</li>"
            "<li>נ.צ. ברשת ישראל: 1/2</li></ul>"
        )
        details = free_camp_details(html)
        self.assertIn("עשוש", details["summary"])
        self.assertNotIn("חניון שלט", details["summary"])
        self.assertEqual(details["sections"][0]["items"], ["מספר מקומות לינה: 200", "הנחיות הגעה: על כביש 40"])

    def test_snippet_and_list_items(self):
        self.assertEqual(list_items("<ul><li>שירותים</li><li>מים</li></ul>"), ["שירותים", "מים"])
        text = route_snippet("<p>פתיח</p><p>תיאור המסלול יוצאים מהחניון וממשיכים לאורך הנחל עד המעיין.</p>")
        self.assertIn("יוצאים מהחניון", text)


if __name__ == "__main__":
    unittest.main()
