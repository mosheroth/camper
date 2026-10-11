import unittest

from scripts.photos import (
    clean_credit,
    merge_photos,
    photos_from_html,
    photos_from_media,
    photos_from_paid,
    photos_from_trail,
)


class PhotoTests(unittest.TestCase):
    def test_paid_slider_keeps_the_credit_and_skips_a_map(self):
        photos = photos_from_paid({
            "rp_slider": [
                {
                    "show_slider_item": True,
                    "credit": "צילום: סטודיו 4040",
                    "desktop_image": {
                        "url": "https://www.parks.org.il/wp-content/uploads/2026/05/camp.jpg",
                        "sizes": {
                            "medium_large": "https://www.parks.org.il/wp-content/uploads/2026/05/camp-768x512.jpg",
                            "medium_large-width": 768,
                        },
                        "width": 1600,
                    },
                },
                {"show_slider_item": False, "desktop_image": {"url": "https://www.parks.org.il/hidden.jpg"}},
            ],
            "map_images": {
                "url": "https://www.parks.org.il/wp-content/uploads/2020/06/מפת-החניון.jpg",
                "alt": "מפת חניון",
                "width": 1200,
            },
        })
        self.assertEqual(len(photos), 1)
        self.assertIn("768x512", photos[0]["src"])
        self.assertEqual(photos[0]["credit"], "צילום: סטודיו 4040")

    def test_trail_photos_drop_the_duplicate_hero(self):
        shared = "https://www.parks.org.il/wp-content/uploads/2019/06/nekarot.jpg"
        photos = photos_from_trail({
            "image": {"url": shared, "caption": "פרסת נקרות. צילום: צור נצר", "width": 1000},
            "images": [
                {"image": {"url": shared, "caption": "פרסת נקרות. צילום: צור נצר", "width": 1000}},
                {"image": {"url": "https://www.parks.org.il/wp-content/uploads/2019/09/spring-300x200.jpg", "width": 300}},
                {"image": {"url": "https://www.parks.org.il/wp-content/uploads/2019/09/spring.jpg", "caption": "צילום: ליאור שווימר", "width": 1200}},
            ],
        })
        self.assertEqual([photo["src"] for photo in photos], [
            shared,
            "https://www.parks.org.il/wp-content/uploads/2019/09/spring.jpg",
        ])
        self.assertIn("ליאור שווימר", photos[1]["credit"])

    def test_html_and_media_merge_without_repeating_a_shot(self):
        html = (
            '<img src="https://writer.parks.org.il/wp-content/uploads/2026/08/ashalim.jpeg" '
            'alt="חניון באר אשלים. צילום: מארק כץ" '
            'srcset="https://www.parks.org.il/wp-content/uploads/2026/08/ashalim-300x135.jpeg 300w, '
            'https://www.parks.org.il/wp-content/uploads/2026/08/ashalim.jpeg 1600w">'
            '<p class="wp-caption-text">צילום: מארק כץ</p>'
        )
        page = photos_from_html(html)
        media = photos_from_media([{
            "mime_type": "image/jpeg",
            "source_url": "https://www.parks.org.il/wp-content/uploads/2026/08/ashalim.jpeg",
            "alt_text": "חניון באר אשלים. צילום: מארק כץ",
            "caption": {"rendered": "<p>צילום: מארק כץ</p>"},
            "media_details": {"width": 1600, "sizes": {"medium_large": {"source_url": "https://www.parks.org.il/wp-content/uploads/2026/08/ashalim-768x346.jpeg", "width": 768}}},
        }])
        merged = merge_photos(page, media)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["credit"], "צילום: מארק כץ")
        self.assertTrue(merged[0]["src"].startswith("https://www.parks.org.il/"))

    def test_tiny_intermediate_size_is_not_the_one_we_show(self):
        photos = photos_from_media([{
            "mime_type": "image/jpeg",
            "source_url": "https://www.parks.org.il/wp-content/uploads/2023/12/horshat.jpg",
            "alt_text": "",
            "caption": {"rendered": "<p>צילום: לימור</p>"},
            "media_details": {
                "width": 600,
                "sizes": {
                    "medium": {
                        "source_url": "https://www.parks.org.il/wp-content/uploads/2023/12/horshat-225x300.jpg",
                        "width": 225,
                    }
                },
            },
        }])
        self.assertEqual(photos[0]["src"], "https://www.parks.org.il/wp-content/uploads/2023/12/horshat.jpg")

    def test_credit_strips_markup(self):
        self.assertEqual(clean_credit("<p>צילום: לימור קטן</p>"), "צילום: לימור קטן")


if __name__ == "__main__":
    unittest.main()
