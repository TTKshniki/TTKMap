from __future__ import annotations

import logging
import time


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.info("TTKMap worker foundation is idle; stitching worker is supplied by ttk-stitch-worker.")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
