from __future__ import annotations

from datetime import datetime, timezone
import json
import struct
import zlib
from io import BytesIO
from pathlib import Path

from backend.app.auth import hash_password
from backend.app.config import settings
from backend.app.db import database, initialize_database, transaction
from backend.app.modules.media.storage import AssetStore
from PIL import Image, ImageDraw


DEMO_ORGANIZER_ID = "00000000-0000-4000-8000-000000000099"
DEMO_ORGANIZER_EMAIL = "alexey@ttk.ru"
DEMO_ORGANIZER_PASSWORD = "ttkmap-organizer-2026"

PLAZA_SLUG = "ttkplazabusinesscenteraaaa"
EXPO_SLUG = "ttkexpocitypavilionmapaaaa"
HOTEL_SLUG = "ttkgrandcityhotelspaceaaaa"
SHOWCASE_SLUG = "ttkshowcampusmapdemoaaaaaa"


def make_png_bytes(width: int = 800, height: int = 400, rgb: tuple[int, int, int] = (227, 27, 35)) -> bytes:
    """Create a valid minimal RGB PNG image using standard library only."""
    row = b"\x00" + bytes(rgb) * width
    raw = row * height

    def chunk(tag: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(tag + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, level=1)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _demo_uuid(number: int) -> str:
    return f"00000000-0000-4000-8000-{number:012d}"


def _showcase_plan_png() -> bytes:
    """A clearly illustrative, legible floor-plan texture for the expert demo."""
    image = Image.new("RGB", (1400, 1000), "#f4f7f4")
    draw = ImageDraw.Draw(image)
    for x in range(0, 1401, 40):
        draw.line((x, 0, x, 1000), fill="#e3eae5", width=1)
    for y in range(0, 1001, 40):
        draw.line((0, y, 1400, y), fill="#e3eae5", width=1)

    # Coordinates match the 700 x 500 map document below (scaled by 2).
    rooms = [
        ((70, 80, 400, 420), "#dcece5"),
        ((440, 80, 1330, 420), "#f4e8d6"),
        ((70, 600, 640, 920), "#e4e8f5"),
        ((680, 600, 1330, 920), "#f5e1e2"),
        ((70, 450, 1330, 570), "#e9efed"),
    ]
    for bounds, fill in rooms:
        draw.rounded_rectangle(bounds, radius=18, fill=fill, outline="#668078", width=4)
    draw.line((420, 80, 420, 420), fill="#203c3c", width=10)
    draw.line((660, 600, 660, 920), fill="#203c3c", width=10)
    draw.line((70, 440, 1330, 440), fill="#203c3c", width=10)
    draw.line((70, 580, 1330, 580), fill="#203c3c", width=10)
    # Entrances/openings
    for x in (190, 520, 900, 1110):
        draw.line((x, 435, x + 60, 435), fill="#f4f7f4", width=14)
        draw.line((x, 585, x + 60, 585), fill="#f4f7f4", width=14)
    for x, y, color in ((160, 500, "#1d6860"), (520, 250, "#e31b23"), (990, 250, "#2563eb"), (930, 760, "#7c3aed")):
        draw.ellipse((x - 15, y - 15, x + 15, y + 15), fill=color, outline="white", width=5)
    draw.rounded_rectangle((40, 30, 420, 68), radius=12, fill="#203c3c")
    draw.text((58, 40), "TTK DIGITAL CAMPUS  /  DEMO PLAN", fill="white")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _showcase_panorama_png(index: int) -> bytes:
    """Synthetic equirectangular illustration; never presented as a camera stitch."""
    palettes = [
        ((34, 69, 67), (226, 232, 222), (112, 136, 124)),
        ((41, 70, 83), (238, 232, 215), (170, 112, 68)),
        ((48, 58, 82), (229, 235, 233), (88, 123, 145)),
        ((74, 58, 68), (239, 227, 211), (138, 95, 74)),
    ][index % 4]
    image = Image.new("RGB", (1024, 512), palettes[0])
    draw = ImageDraw.Draw(image)
    # A cylindrical-room illustration with seam-aligned wall/floor/ceiling bands.
    draw.rectangle((0, 70, 1023, 345), fill=palettes[0])
    draw.rectangle((0, 345, 1023, 511), fill=palettes[1])
    draw.polygon(((0, 0), (1023, 0), (1023, 72), (0, 72)), fill=(226, 231, 222))
    draw.line((0, 345, 1023, 345), fill=(255, 255, 255), width=5)
    for x in (0, 256, 512, 768, 1023):
        draw.line((x, 72, x, 345), fill=palettes[2], width=5)
        draw.line((x, 345, x - 90, 511), fill=(196, 204, 193), width=2)
        draw.line((x, 345, x + 90, 511), fill=(196, 204, 193), width=2)
    # Seam-safe architectural doorways and accent panels.
    for x in (120 + index * 35, 600 + index * 27):
        draw.rounded_rectangle((x, 122, x + 118, 340), radius=9, fill=(25, 42, 43), outline=(222, 233, 224), width=5)
        draw.rectangle((x + 12, 135, x + 106, 327), fill=palettes[2])
    for x in (50, 960):
        draw.rectangle((x, 125, x + 42, 245), fill=(227, 27, 35))
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _showcase_space() -> dict:
    """One canonical multi-room map that demonstrates the integrated web flows."""
    map_id = _demo_uuid(201)
    plan_id = _demo_uuid(202)
    nodes = [
        {"id": _demo_uuid(203), "x": 110.0, "y": 250.0},
        {"id": _demo_uuid(204), "x": 270.0, "y": 250.0},
        {"id": _demo_uuid(205), "x": 470.0, "y": 150.0},
        {"id": _demo_uuid(206), "x": 510.0, "y": 380.0},
    ]
    pois = [
        {"id": _demo_uuid(207), "title": "Главный вход и ресепшен", "category": "entrance", "description": "Входная группа, стойка информации и контроль доступа.", "x": 110.0, "y": 250.0, "nav_node_id": nodes[0]["id"]},
        {"id": _demo_uuid(208), "title": "Демо-стенд ТТК", "category": "booth", "description": "Интерактивная демонстрация цифровой инфраструктуры и сервисов ТТК.", "x": 450.0, "y": 150.0, "nav_node_id": nodes[2]["id"]},
        {"id": _demo_uuid(209), "title": "Гигабитный Wi-Fi", "category": "wifi", "description": "Гостевая сеть и зона для подключения устройств.", "x": 295.0, "y": 250.0, "nav_node_id": nodes[1]["id"]},
        {"id": _demo_uuid(210), "title": "Конференц-зал «Цифра»", "category": "hall", "description": "Сцена для презентаций и экспертных сессий.", "x": 510.0, "y": 380.0, "nav_node_id": nodes[3]["id"]},
        {"id": _demo_uuid(211), "title": "Инфо-стойка", "category": "service_desk", "description": "Помощь гостям и навигация по площадке.", "x": 135.0, "y": 250.0, "nav_node_id": nodes[0]["id"]},
        {"id": _demo_uuid(212), "title": "Зона регистрации", "category": "custom", "category_label": "Регистрация", "description": "Регистрация участников демонстрации.", "x": 110.0, "y": 210.0, "nav_node_id": nodes[0]["id"]},
    ]
    for poi in pois:
        poi.setdefault("category_label", None)
    panoramas = []
    for index, (node, title) in enumerate(zip(nodes, ["Вход и ресепшен", "Центральный проход", "Демо-стенд ТТК", "Конференц-зал Цифра"])):
        panoramas.append({
            "id": _demo_uuid(220 + index),
            "asset_id": _demo_uuid(230 + index),
            "title": f"360° · {title}",
            "x": node["x"],
            "y": node["y"],
            "nav_node_id": node["id"],
            "heading_offset_deg": 0.0,
        })
    hotspots = []
    for index, (panorama, poi) in enumerate(zip(panoramas, [pois[0], pois[2], pois[1], pois[3]])):
        hotspots.append({
            "id": _demo_uuid(240 + index * 3),
            "panorama_id": panorama["id"],
            "kind": "poi",
            "yaw_deg": 0.0,
            "pitch_deg": 0.0,
            "poi_id": poi["id"],
            "target_panorama_id": None,
        })
    for index in range(len(panoramas) - 1):
        a, b = panoramas[index], panoramas[index + 1]
        hotspots.extend([
            {"id": _demo_uuid(241 + index * 3), "panorama_id": a["id"], "kind": "transition", "yaw_deg": 35.0, "pitch_deg": -3.0, "poi_id": None, "target_panorama_id": b["id"]},
            {"id": _demo_uuid(242 + index * 3), "panorama_id": b["id"], "kind": "transition", "yaw_deg": -145.0, "pitch_deg": -3.0, "poi_id": None, "target_panorama_id": a["id"]},
        ])

    shapes = [
        {"id": _demo_uuid(250), "kind": "room", "label": "Лобби и ресепшен", "points": [{"x": 35, "y": 40}, {"x": 200, "y": 40}, {"x": 200, "y": 220}, {"x": 35, "y": 220}]},
        {"id": _demo_uuid(251), "kind": "room", "label": "Экспозиция ТТК", "points": [{"x": 220, "y": 40}, {"x": 665, "y": 40}, {"x": 665, "y": 220}, {"x": 220, "y": 220}]},
        {"id": _demo_uuid(252), "kind": "corridor", "label": "Центральная галерея", "points": [{"x": 35, "y": 230}, {"x": 665, "y": 230}, {"x": 665, "y": 285}, {"x": 35, "y": 285}]},
        {"id": _demo_uuid(253), "kind": "room", "label": "Форум «Цифра»", "points": [{"x": 35, "y": 300}, {"x": 320, "y": 300}, {"x": 320, "y": 460}, {"x": 35, "y": 460}]},
        {"id": _demo_uuid(254), "kind": "room", "label": "Лаунж и networking", "points": [{"x": 340, "y": 300}, {"x": 665, "y": 300}, {"x": 665, "y": 460}, {"x": 340, "y": 460}]},
        {"id": _demo_uuid(255), "kind": "wall", "label": "Внешний контур", "points": [{"x": 35, "y": 40}, {"x": 665, "y": 40}, {"x": 665, "y": 460}, {"x": 35, "y": 460}, {"x": 35, "y": 40}]},
        {"id": _demo_uuid(256), "kind": "wall", "label": "Перегородки", "points": [{"x": 210, "y": 40}, {"x": 210, "y": 220}, {"x": 35, "y": 220}, {"x": 35, "y": 295}, {"x": 330, "y": 295}, {"x": 330, "y": 460}]},
        {"id": _demo_uuid(257), "kind": "wall", "label": "Перегородки", "points": [{"x": 35, "y": 292}, {"x": 665, "y": 292}, {"x": 665, "y": 295}, {"x": 340, "y": 295}]},
    ]
    edges = [
        {"id": _demo_uuid(260 + i), "a": nodes[i]["id"], "b": nodes[i + 1]["id"]}
        for i in range(len(nodes) - 1)
    ]
    return {
        "map_id": map_id,
        "slug": SHOWCASE_SLUG,
        "title": "TTK Digital Campus · эталонная демо-модель",
        "description": "Экспертная демонстрация TTKMap: план, POI, маршруты, интерактивная изометрия и связанный 360°-проход. План и панорамы — синтетические иллюстрации, не результаты съёмки или stitching.",
        "scale": 0.1,
        "rgb": (29, 104, 96),
        "plan_asset_id": _demo_uuid(202),
        "plan_image": _showcase_plan_png(),
        "shapes": shapes,
        "nodes": nodes,
        "edges": edges,
        "pois": pois,
        "panoramas": panoramas,
        "hotspots": hotspots,
    }


def seed_demo_data(force: bool = False) -> dict[str, str]:
    initialize_database()
    settings.media_path.mkdir(parents=True, exist_ok=True)
    store = AssetStore(settings.media_path)
    now = _now()

    with database() as connection:
        with transaction(connection, immediate=True):
            existing_user = connection.execute("SELECT id FROM users WHERE email=?", (DEMO_ORGANIZER_EMAIL,)).fetchone()
            if existing_user is not None and not force:
                existing_maps = {
                    row["slug"]: row["id"]
                    for row in connection.execute(
                        "SELECT id,slug FROM maps WHERE slug IN (?,?,?,?)",
                        (PLAZA_SLUG, EXPO_SLUG, HOTEL_SLUG, SHOWCASE_SLUG),
                    )
                }
                if len(existing_maps) == 4:
                    return existing_maps

            if existing_user is None:
                user_id = DEMO_ORGANIZER_ID
                connection.execute(
                    "INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)",
                    (user_id, DEMO_ORGANIZER_EMAIL, hash_password(DEMO_ORGANIZER_PASSWORD), "organizer", now),
                )
            else:
                user_id = existing_user["id"]

            spaces = [
                {
                    "map_id": "00000000-0000-4000-8000-000000000101",
                    "slug": PLAZA_SLUG,
                    "title": "Бизнес-центр «ТТК Плаза»",
                    "description": "Главный офис ТрансТелеком. Переговорные комнаты, серверные, кофе-пойнты и зоны отдыха.",
                    "scale": 0.1,
                    "rgb": (227, 27, 35),
                    "shapes": [
                        {
                            "id": "00000000-0000-4000-8000-000000001001",
                            "kind": "room",
                            "label": "Зона ресепшн",
                            "points": [{"x": 40, "y": 40}, {"x": 220, "y": 40}, {"x": 220, "y": 460}, {"x": 40, "y": 460}],
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000001002",
                            "kind": "room",
                            "label": "Переговорная Альфа",
                            "points": [{"x": 220, "y": 40}, {"x": 480, "y": 40}, {"x": 480, "y": 250}, {"x": 220, "y": 250}],
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000001003",
                            "kind": "room",
                            "label": "Главный Конференц-Зал",
                            "points": [{"x": 220, "y": 250}, {"x": 660, "y": 250}, {"x": 660, "y": 460}, {"x": 220, "y": 460}],
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000001004",
                            "kind": "wall",
                            "label": "Внешний контур",
                            "points": [{"x": 40, "y": 40}, {"x": 660, "y": 40}, {"x": 660, "y": 460}, {"x": 40, "y": 460}, {"x": 40, "y": 40}],
                        },
                    ],
                    "nodes": [
                        {"id": "00000000-0000-4000-8000-000000002001", "x": 175.0, "y": 150.0},
                        {"id": "00000000-0000-4000-8000-000000002002", "x": 385.0, "y": 150.0},
                        {"id": "00000000-0000-4000-8000-000000002003", "x": 280.0, "y": 350.0},
                        {"id": "00000000-0000-4000-8000-000000002004", "x": 540.0, "y": 150.0},
                    ],
                    "edges": [
                        {"id": "00000000-0000-4000-8000-000000003001", "a": "00000000-0000-4000-8000-000000002001", "b": "00000000-0000-4000-8000-000000002002"},
                        {"id": "00000000-0000-4000-8000-000000003002", "a": "00000000-0000-4000-8000-000000002002", "b": "00000000-0000-4000-8000-000000002003"},
                        {"id": "00000000-0000-4000-8000-000000003003", "a": "00000000-0000-4000-8000-000000002001", "b": "00000000-0000-4000-8000-000000002003"},
                        {"id": "00000000-0000-4000-8000-000000003004", "a": "00000000-0000-4000-8000-000000002002", "b": "00000000-0000-4000-8000-000000002004"},
                    ],
                    "pois": [
                        {
                            "id": "00000000-0000-4000-8000-000000004001",
                            "title": "Central Lobby & Reception",
                            "category": "entrance",
                            "category_label": None,
                            "description": "Корпус A, Этаж 1 | Свободно | 50 человек | Стойка информации, Турникеты, Инфо-терминал | TTK_Guest_5G (до 500 Мбит/с)",
                            "x": 175.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002001",
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000004002",
                            "title": "Переговорная Альфа",
                            "category": "hall",
                            "category_label": None,
                            "description": "Корпус A, Этаж 3 | Свободно | 10 человек | Проектор 4K, маркерная доска, ВКС Cisco | TTK_VIP_Conference",
                            "x": 385.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002002",
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000004003",
                            "title": "Главный Конференц-Зал",
                            "category": "hall",
                            "category_label": None,
                            "description": "Корпус B, Этаж 2 | Занято | 120 человек | Сцена, LED-экран 8x4m, Радиомикрофоны | TTK_Event_Free",
                            "x": 280.0,
                            "y": 350.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002003",
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000004004",
                            "title": "Зона высокоскоростного Wi-Fi ТТК",
                            "category": "wifi",
                            "category_label": None,
                            "description": "Корпус A, Этаж 2 | Свободно | 30 человек | Коворкинг, розетки 220V, принтер | TTK_Ultra_WiFi6",
                            "x": 540.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002004",
                        },
                    ],
                    "panoramas": [
                        {
                            "id": "00000000-0000-4000-8000-000000005001",
                            "asset_id": "00000000-0000-4000-8000-000000006001",
                            "title": "Панорама: Central Lobby & Reception",
                            "x": 175.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002001",
                            "heading_offset_deg": 0.0,
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000005002",
                            "asset_id": "00000000-0000-4000-8000-000000006002",
                            "title": "Панорама: Переговорная Альфа",
                            "x": 385.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002002",
                            "heading_offset_deg": 0.0,
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000005003",
                            "asset_id": "00000000-0000-4000-8000-000000006003",
                            "title": "Панорама: Главный Конференц-Зал",
                            "x": 280.0,
                            "y": 350.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002003",
                            "heading_offset_deg": 0.0,
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000005004",
                            "asset_id": "00000000-0000-4000-8000-000000006004",
                            "title": "Панорама: Коворкинг и Wi-Fi ТТК",
                            "x": 540.0,
                            "y": 150.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000002004",
                            "heading_offset_deg": 0.0,
                        },
                    ],
                    "hotspots": [
                        {"id": "00000000-0000-4000-8000-000000007001", "panorama_id": "00000000-0000-4000-8000-000000005001", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000004001", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000007002", "panorama_id": "00000000-0000-4000-8000-000000005001", "kind": "transition", "yaw_deg": 90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005002"},
                        {"id": "00000000-0000-4000-8000-000000007003", "panorama_id": "00000000-0000-4000-8000-000000005001", "kind": "transition", "yaw_deg": 150.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005003"},
                        {"id": "00000000-0000-4000-8000-000000007004", "panorama_id": "00000000-0000-4000-8000-000000005002", "kind": "poi", "yaw_deg": 15.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000004002", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000007005", "panorama_id": "00000000-0000-4000-8000-000000005002", "kind": "transition", "yaw_deg": -90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005001"},
                        {"id": "00000000-0000-4000-8000-000000007006", "panorama_id": "00000000-0000-4000-8000-000000005002", "kind": "transition", "yaw_deg": -150.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005003"},
                        {"id": "00000000-0000-4000-8000-000000007007", "panorama_id": "00000000-0000-4000-8000-000000005002", "kind": "transition", "yaw_deg": 90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005004"},
                        {"id": "00000000-0000-4000-8000-000000007008", "panorama_id": "00000000-0000-4000-8000-000000005003", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 5.0, "poi_id": "00000000-0000-4000-8000-000000004003", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000007009", "panorama_id": "00000000-0000-4000-8000-000000005003", "kind": "transition", "yaw_deg": -30.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005001"},
                        {"id": "00000000-0000-4000-8000-000000007010", "panorama_id": "00000000-0000-4000-8000-000000005003", "kind": "transition", "yaw_deg": 30.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005002"},
                        {"id": "00000000-0000-4000-8000-000000007011", "panorama_id": "00000000-0000-4000-8000-000000005004", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000004004", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000007012", "panorama_id": "00000000-0000-4000-8000-000000005004", "kind": "transition", "yaw_deg": -90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000005002"},
                    ],
                },
                {
                    "map_id": "00000000-0000-4000-8000-000000000102",
                    "slug": EXPO_SLUG,
                    "title": "Выставочный комплекс «Экспо-Сити»",
                    "description": "Инновационный форум связи и телекоммуникаций. Стенды партнёров и зоны нетворкинга.",
                    "scale": 0.15,
                    "rgb": (15, 23, 42),
                    "shapes": [
                        {
                            "id": "00000000-0000-4000-8000-000000011001",
                            "kind": "room",
                            "label": "Павильон №1 — Главный холл",
                            "points": [{"x": 40, "y": 40}, {"x": 660, "y": 40}, {"x": 660, "y": 460}, {"x": 40, "y": 460}],
                        },
                    ],
                    "nodes": [
                        {"id": "00000000-0000-4000-8000-000000012001", "x": 210.0, "y": 200.0},
                        {"id": "00000000-0000-4000-8000-000000012002", "x": 490.0, "y": 200.0},
                    ],
                    "edges": [
                        {"id": "00000000-0000-4000-8000-000000013001", "a": "00000000-0000-4000-8000-000000012001", "b": "00000000-0000-4000-8000-000000012002"},
                    ],
                    "pois": [
                        {
                            "id": "00000000-0000-4000-8000-000000014001",
                            "title": "Главный вход павильона А",
                            "category": "entrance",
                            "category_label": None,
                            "description": "Корпус A, Этаж 1 | Свободно | 200+ человек | Рамки металлодетекторов, Регистрация QR | Expo_Public_WiFi",
                            "x": 210.0,
                            "y": 200.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000012001",
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000014002",
                            "title": "Стенд ТТК Digital & B2B",
                            "category": "booth",
                            "category_label": None,
                            "description": "Корпус A, Этаж 1 | Свободно | 80 человек | Демо-терминалы, VR-зона, переговорные капсулы | TTK_Expo_5G",
                            "x": 490.0,
                            "y": 200.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000012002",
                        },
                    ],
                    "panoramas": [
                        {
                            "id": "00000000-0000-4000-8000-000000015001",
                            "asset_id": "00000000-0000-4000-8000-000000016001",
                            "title": "Панорама: Главный вход павильона А",
                            "x": 210.0,
                            "y": 200.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000012001",
                            "heading_offset_deg": 0.0,
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000015002",
                            "asset_id": "00000000-0000-4000-8000-000000016002",
                            "title": "Панорама: Стенд ТТК Digital",
                            "x": 490.0,
                            "y": 200.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000012002",
                            "heading_offset_deg": 0.0,
                        },
                    ],
                    "hotspots": [
                        {"id": "00000000-0000-4000-8000-000000017001", "panorama_id": "00000000-0000-4000-8000-000000015001", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000014001", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000017002", "panorama_id": "00000000-0000-4000-8000-000000015001", "kind": "transition", "yaw_deg": 90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000015002"},
                        {"id": "00000000-0000-4000-8000-000000017003", "panorama_id": "00000000-0000-4000-8000-000000015002", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000014002", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000017004", "panorama_id": "00000000-0000-4000-8000-000000015002", "kind": "transition", "yaw_deg": -90.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000015001"},
                    ],
                },
                {
                    "map_id": "00000000-0000-4000-8000-000000000103",
                    "slug": HOTEL_SLUG,
                    "title": "Отель «Гранд Сити»",
                    "description": "Конференц-отель с панорамными номерами, спа-комплексом и ресторанами высокой кухни.",
                    "scale": 0.12,
                    "rgb": (30, 41, 59),
                    "shapes": [
                        {
                            "id": "00000000-0000-4000-8000-000000021001",
                            "kind": "room",
                            "label": "Гранд Лобби и Атриум",
                            "points": [{"x": 40, "y": 40}, {"x": 660, "y": 40}, {"x": 660, "y": 460}, {"x": 40, "y": 460}],
                        },
                    ],
                    "nodes": [
                        {"id": "00000000-0000-4000-8000-000000022001", "x": 350.0, "y": 250.0},
                        {"id": "00000000-0000-4000-8000-000000022002", "x": 520.0, "y": 340.0},
                    ],
                    "edges": [
                        {"id": "00000000-0000-4000-8000-000000023001", "a": "00000000-0000-4000-8000-000000022001", "b": "00000000-0000-4000-8000-000000022002"},
                    ],
                    "pois": [
                        {
                            "id": "00000000-0000-4000-8000-000000024001",
                            "title": "Ресепшн и Лобби",
                            "category": "entrance",
                            "category_label": None,
                            "description": "Корпус A, Этаж 1 | Свободно | 40 человек | Стойка регистрации, консьерж | GrandCity_Guest",
                            "x": 350.0,
                            "y": 250.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000022001",
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000024002",
                            "title": "Банкетный зал «Империал»",
                            "category": "hall",
                            "category_label": None,
                            "description": "Корпус A, Этаж 2 | Свободно | 150 человек | Акустическая система, проекторы, подиум | GrandCity_VIP_5G",
                            "x": 520.0,
                            "y": 340.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000022002",
                        },
                    ],
                    "panoramas": [
                        {
                            "id": "00000000-0000-4000-8000-000000025001",
                            "asset_id": "00000000-0000-4000-8000-000000026001",
                            "title": "Панорама: Ресепшн и Лобби",
                            "x": 350.0,
                            "y": 250.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000022001",
                            "heading_offset_deg": 0.0,
                        },
                        {
                            "id": "00000000-0000-4000-8000-000000025002",
                            "asset_id": "00000000-0000-4000-8000-000000026002",
                            "title": "Панорама: Банкетный зал «Империал»",
                            "x": 520.0,
                            "y": 340.0,
                            "nav_node_id": "00000000-0000-4000-8000-000000022002",
                            "heading_offset_deg": 0.0,
                        },
                    ],
                    "hotspots": [
                        {"id": "00000000-0000-4000-8000-000000027001", "panorama_id": "00000000-0000-4000-8000-000000025001", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000024001", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000027002", "panorama_id": "00000000-0000-4000-8000-000000025001", "kind": "transition", "yaw_deg": 115.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000025002"},
                        {"id": "00000000-0000-4000-8000-000000027003", "panorama_id": "00000000-0000-4000-8000-000000025002", "kind": "poi", "yaw_deg": 0.0, "pitch_deg": 0.0, "poi_id": "00000000-0000-4000-8000-000000024002", "target_panorama_id": None},
                        {"id": "00000000-0000-4000-8000-000000027004", "panorama_id": "00000000-0000-4000-8000-000000025002", "kind": "transition", "yaw_deg": -65.0, "pitch_deg": -5.0, "poi_id": None, "target_panorama_id": "00000000-0000-4000-8000-000000025001"},
                    ],
                },
            ]
            spaces.append(_showcase_space())

            png_cache: dict[tuple[int, int, int], bytes] = {}
            result_slugs: dict[str, str] = {}

            for sp in spaces:
                map_id = sp["map_id"]
                slug = sp["slug"]
                result_slugs[slug] = map_id
                exists = connection.execute("SELECT id FROM maps WHERE id=? OR slug=?", (map_id, slug)).fetchone()
                if exists is not None:
                    continue

                connection.execute(
                    "INSERT INTO maps(id,owner_id,slug,title,description,is_published,revision,width_units,height_units,scale_m_per_unit,max_walk_gap_units,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (map_id, user_id, slug, sp["title"], sp["description"], 1, 1, 700, 500, sp["scale"], 500.0, now, now),
                )

                rgb = sp["rgb"]
                if rgb not in png_cache:
                    png_cache[rgb] = make_png_bytes(800, 400, rgb)
                raw_png = png_cache[rgb]

                for pano in sp["panoramas"]:
                    asset_id = pano["asset_id"]
                    pano_png = sp.get("panorama_images", {}).get(asset_id)
                    if pano_png is None and sp.get("plan_asset_id"):
                        pano_png = _showcase_panorama_png(sp["panoramas"].index(pano))
                    pano_png = pano_png or raw_png
                    pano_width, pano_height = (1024, 512) if sp.get("plan_asset_id") else (800, 400)
                    preview_key, mobile_key, full_key, fw, fh = store.store_asset_variants(
                        asset_id, pano_png, pano_width, pano_height, kind="panorama"
                    )
                    connection.execute(
                        "INSERT INTO assets(id,map_id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,v_offset_deg,preview_key,mobile_key,full_key,created_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (asset_id, map_id, "panorama", "upload", fw, fh, "equirectangular", 360, 180.0, 0.0, preview_key, mobile_key, full_key, now),
                    )

                if sp.get("plan_asset_id"):
                    asset_id = sp["plan_asset_id"]
                    plan_png = sp["plan_image"]
                    preview_key, mobile_key, full_key, fw, fh = store.store_asset_variants(
                        asset_id, plan_png, 1400, 1000
                    )
                    connection.execute(
                        "INSERT INTO assets(id,map_id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,v_offset_deg,preview_key,mobile_key,full_key,created_at) "
                        "VALUES(?,?, 'plan','upload',?,?,NULL,NULL,NULL,NULL,?,?,?,?)",
                        (asset_id, map_id, fw, fh, preview_key, mobile_key, full_key, now),
                    )
                    connection.execute(
                        "INSERT INTO map_backgrounds(map_id,asset_id,asset_kind) VALUES(?,?,'plan')",
                        (map_id, asset_id),
                    )

                for shape in sp["shapes"]:
                    pts = json.dumps(shape["points"], separators=(",", ":"))
                    connection.execute(
                        "INSERT INTO shapes(id,map_id,kind,label,points_json) VALUES(?,?,?,?,?)",
                        (shape["id"], map_id, shape["kind"], shape["label"], pts),
                    )
                for node in sp["nodes"]:
                    connection.execute(
                        "INSERT INTO nav_nodes(id,map_id,x,y) VALUES(?,?,?,?)",
                        (node["id"], map_id, node["x"], node["y"]),
                    )
                for edge in sp["edges"]:
                    connection.execute(
                        "INSERT INTO nav_edges(id,map_id,a,b) VALUES(?,?,?,?)",
                        (edge["id"], map_id, edge["a"], edge["b"]),
                    )
                for poi in sp["pois"]:
                    connection.execute(
                        "INSERT INTO pois(id,map_id,title,category,category_label,description,x,y,nav_node_id) VALUES(?,?,?,?,?,?,?,?,?)",
                        (poi["id"], map_id, poi["title"], poi["category"], poi["category_label"], poi["description"], poi["x"], poi["y"], poi["nav_node_id"]),
                    )
                for pano in sp["panoramas"]:
                    connection.execute(
                        "INSERT INTO panoramas(id,map_id,asset_id,title,x,y,nav_node_id,heading_offset_deg) VALUES(?,?,?,?,?,?,?,?)",
                        (pano["id"], map_id, pano["asset_id"], pano["title"], pano["x"], pano["y"], pano["nav_node_id"], pano["heading_offset_deg"]),
                    )
                for hs in sp["hotspots"]:
                    connection.execute(
                        "INSERT INTO hotspots(id,map_id,panorama_id,kind,yaw_deg,pitch_deg,poi_id,target_panorama_id) VALUES(?,?,?,?,?,?,?,?)",
                        (hs["id"], map_id, hs["panorama_id"], hs["kind"], hs["yaw_deg"], hs["pitch_deg"], hs["poi_id"], hs["target_panorama_id"]),
                    )

            return result_slugs


if __name__ == "__main__":
    seeded = seed_demo_data()
    print("Seeded TTKMap demo spaces:", json.dumps(seeded, ensure_ascii=False))
