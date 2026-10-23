# Stitch worker boundary

The worker is a separate process/container. It claims durable capture jobs from SQLite, invokes Hugin/enblend without a shell, and commits a ready asset only after measured coverage and lease validation. It must never fabricate a panorama when stitching fails.
