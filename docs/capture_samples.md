# TTKMap Capture Samples Documentation

## Overview

This document describes the real capture samples used for testing the panorama stitching pipeline.

## Series 01: Indoor Office Space

**Location:** Indoor office environment
**Device:** Smartphone (details unknown from EXIF)
**Capture Date:** 2024-10-24
**Total Frames:** 16
**Angular Step:** 22.5° (360° / 16)
**Resolution:** 1920×2560 (portrait orientation)

### Capture Method

1. Photographer stood at a fixed point
2. Rotated approximately 22.5° between each shot
3. Maintained consistent height and tilt angle
4. Covered full 360° horizontal rotation

### Frame Order

Frames are numbered sequentially from 1 to 16, starting at an arbitrary 0° reference direction and rotating clockwise when viewed from above.

| Frame | Filename | Approx. Yaw |
|-------|----------|-------------|
| 1 | photo_1_2026-10-24_08-13-40.jpg | 0° |
| 2 | photo_2_2026-10-24_08-13-40.jpg | 22.5° |
| 3 | photo_3_2026-10-24_08-13-40.jpg | 45° |
| 4 | photo_4_2026-10-24_08-13-40.jpg | 67.5° |
| 5 | photo_5_2026-10-24_08-13-40.jpg | 90° |
| 6 | photo_6_2026-10-24_08-13-40.jpg | 112.5° |
| 7 | photo_7_2026-10-24_08-13-40.jpg | 135° |
| 8 | photo_8_2026-10-24_08-13-40.jpg | 157.5° |
| 9 | photo_9_2026-10-24_08-13-40.jpg | 180° |
| 10 | photo_10_2026-10-24_08-13-40.jpg | 202.5° |
| 11 | photo_11_2026-10-24_08-13-40.jpg | 225° |
| 12 | photo_12_2026-10-24_08-13-40.jpg | 247.5° |
| 13 | photo_13_2026-10-24_08-13-40.jpg | 270° |
| 14 | photo_14_2026-10-24_08-13-40.jpg | 292.5° |
| 15 | photo_15_2026-10-24_08-13-40.jpg | 315° |
| 16 | photo_16_2026-10-24_08-13-40.jpg | 337.5° |

### Expected Stitching Result

- **Output Format:** Equirectangular (2:1 aspect ratio)
- **Minimum Resolution:** 4096×2048 pixels
- **Horizontal Coverage:** 360°
- **Vertical Coverage:** ~120-180° (depending on portrait frame crop)
- **Quality:** Acceptable overlap between adjacent frames

### Testing Notes

- This series represents a **valid complete capture** suitable for stitching
- Frames should have sufficient overlap (typically 20-30% between adjacent shots)
- Feature matching algorithms should find correspondences between consecutive frames
- The stitched result should have a closed horizontal loop (frame 16 connects back to frame 1)

## Negative Test Cases

### Incomplete Series
- **Purpose:** Test handling of insufficient frames
- **Implementation:** Use only frames 1-8 (missing 180° of coverage)
- **Expected Result:** Stitching should fail or produce incomplete panorama

### Duplicate Frames
- **Purpose:** Test handling of invalid angular progression
- **Implementation:** Replace frame 5 with a duplicate of frame 4
- **Expected Result:** Angular consistency check should fail

### Unrelated Images
- **Purpose:** Test handling of non-matching images
- **Implementation:** Mix frames from different locations
- **Expected Result:** Feature matching should fail with insufficient correspondences

## Provenance and Licensing

**Source:** Real device capture provided by project contributor
**License:** Used with permission for TTKMap testing purposes only
**Usage:** Integration and stitching algorithm testing
**Attribution:** These are genuine photos captured for this project, not synthetic renders or stock images

## Verification

To verify the capture series:

```bash
# Check frame count
ls backend/tests/fixtures/stitch/series_01/*.jpg | wc -l
# Should output: 16

# Check file sizes (all should be reasonable JPEG sizes)
ls -lh backend/tests/fixtures/stitch/series_01/

# Verify images are valid JPEGs
file backend/tests/fixtures/stitch/series_01/*.jpg
```

## Future Additions

For comprehensive testing, consider adding:
- Series from different devices (iPhone, Android brands)
- Outdoor captures with different lighting
- Series with varying overlap amounts
- Edge cases (very bright/dark environments)
