import pytest
from PIL import Image
from services.ebook.pipeline.comics.page_composer import PageComposer


@pytest.fixture
def composer():
    return PageComposer()


@pytest.fixture
def dummy_panel_image():
    return Image.new("RGB", (200, 200), color=(100, 150, 200))


@pytest.fixture
def sample_page_2x2(dummy_panel_image):
    panels = [{"panel_id": f"p{i}", "dialogue": [], "sfx": []} for i in range(4)]
    panel_images = {f"p{i}": dummy_panel_image for i in range(4)}
    page = {"layout": "2x2", "panels": panels}
    return page, panel_images


def test_2x2_layout_has_4_panels(composer, sample_page_2x2):
    page, panel_images = sample_page_2x2
    result = composer.compose_page(page, panel_images)
    assert result is not None
    # 2x2 layout should fill the canvas
    assert result.size == (1200, 1694)


def test_splash_layout_fills_full_page(composer, dummy_panel_image):
    page = {
        "layout": "splash",
        "panels": [{"panel_id": "p0", "dialogue": [], "sfx": []}],
    }
    panel_images = {"p0": dummy_panel_image}
    result = composer.compose_page(page, panel_images)
    assert result.size == (1200, 1694)


def test_rtl_reverses_panel_order(composer, dummy_panel_image):
    # Create 2 panels with distinct colors
    red_img = Image.new("RGB", (200, 200), color=(255, 0, 0))
    blue_img = Image.new("RGB", (200, 200), color=(0, 0, 255))
    panels = [
        {"panel_id": "left", "dialogue": [], "sfx": []},
        {"panel_id": "right", "dialogue": [], "sfx": []},
    ]
    panel_images = {"left": red_img, "right": blue_img}
    page = {"layout": "2x2", "panels": panels}

    # RTL: panels list is reversed before layout assignment
    # We just test that it doesn't raise and returns correct size
    result_rtl = composer.compose_page(page, panel_images, rtl=True)
    result_ltr = composer.compose_page(page, panel_images, rtl=False)
    assert result_rtl.size == result_ltr.size
    # Colors in top-left should differ between RTL and LTR when panels are distinct
    px_rtl = result_rtl.getpixel((50, 50))
    px_ltr = result_ltr.getpixel((50, 50))
    assert px_rtl != px_ltr


def test_speech_bubble_rendered_on_page(composer, dummy_panel_image):
    page = {
        "layout": "splash",
        "panels": [
            {
                "panel_id": "p0",
                "dialogue": [
                    {"character": "Hero", "text": "Hello world!", "is_sfx": False}
                ],
                "sfx": [],
            }
        ],
    }
    panel_images = {"p0": dummy_panel_image}
    result = composer.compose_page(page, panel_images)
    # Speech bubble should draw white pixels near top of page
    assert result is not None
    # Verify a white pixel exists (bubble background) somewhere near top-left
    found_white = False
    for x in range(100, 400):
        for y in range(10, 80):
            if result.getpixel((x, y)) == (255, 255, 255):
                found_white = True
                break
        if found_white:
            break
    assert found_white, "Expected white speech bubble pixels near top of page"


def test_output_size_matches_spec(composer, dummy_panel_image):
    page = {"layout": "2x2", "panels": [], "sfx": []}
    result = composer.compose_page(page, {}, output_size=(800, 1200))
    assert result.size == (800, 1200)


def test_webtoon_strip_height_equals_sum_of_pages(composer):
    pages = [
        Image.new("RGB", (800, 400), color=(200, 200, 200)),
        Image.new("RGB", (800, 600), color=(180, 180, 180)),
        Image.new("RGB", (800, 300), color=(160, 160, 160)),
    ]
    strip = composer.compose_webtoon_strip(pages, panel_width=800)
    expected_height = 400 + 600 + 300
    assert strip.height == expected_height
    assert strip.width == 800
