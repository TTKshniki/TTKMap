# Stitch Test Fixtures

This directory contains real capture samples for testing the panorama stitching pipeline.

## Directory Structure

```
stitch/
├── manifest.json              # Metadata for all test series
├── series_01/                 # Valid complete capture (16 frames)
├── negative_incomplete/       # Only 8 frames (insufficient coverage)
├── negative_duplicates/       # Frame 5 replaced with duplicate of frame 4
└── negative_unrelated/        # Reserved for unrelated images test case
```

## Valid Series

### series_01
- **Frames:** 16 images covering 360°
- **Device:** Smartphone camera
- **Resolution:** 1920×2560 (portrait)
- **Angular step:** 22.5°
- **Purpose:** Valid stitching input for integration tests

## Negative Test Cases

### negative_incomplete
- **Frames:** 8 images (only 180° coverage)
- **Purpose:** Test handling of insufficient coverage
- **Expected:** Stitching should fail or warn about incomplete panorama

### negative_duplicates
- **Frames:** 16 images, but frame 5 is a duplicate of frame 4
- **Purpose:** Test detection of invalid angular progression
- **Expected:** Feature matching may succeed but angular consistency should fail

### negative_unrelated
- **Purpose:** Test handling of non-matching images from different locations
- **Status:** Reserved for future implementation

## Provenance

All images are genuine device captures provided for TTKMap testing purposes. They are not synthetic renders or stock images.

**License:** Used with permission for testing only.

## Verification

Check that fixtures are correctly set up:

```bash
# Count series_01 frames (should be 16)
ls backend/tests/fixtures/stitch/series_01/*.jpg | wc -l

# Count incomplete frames (should be 8)
ls backend/tests/fixtures/stitch/negative_incomplete/*.jpg | wc -l

# Count duplicate frames (should be 16, but with one duplicate)
ls backend/tests/fixtures/stitch/negative_duplicates/*.jpg | wc -l

# Verify manifest
cat backend/tests/fixtures/stitch/manifest.json | jq '.series[0].capture_params'
```

## Usage in Tests

These fixtures are used by:
- `backend/tests/stitch/test_stitching.py` — Integration tests for Hugin/enblend pipeline
- Worker stitching quality verification
- End-to-end capture → stitch flow tests

See `docs/capture_samples.md` for detailed documentation.
