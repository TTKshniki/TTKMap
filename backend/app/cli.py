from __future__ import annotations

import argparse
import getpass

from backend.app.auth import create_organizer
from backend.app.db import initialize_database


def main() -> None:
    parser = argparse.ArgumentParser(prog="ttkmap")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("init-db")
    subparsers.add_parser("seed-demo")
    organizer = subparsers.add_parser("create-organizer")
    organizer.add_argument("--email", required=True)
    args = parser.parse_args()
    if args.command == "init-db":
        initialize_database()
        return
    if args.command == "seed-demo":
        from scripts.seed_demo import seed_demo_data
        seed_demo_data()
        return
    initialize_database()
    password = getpass.getpass("Organizer password (minimum 12 characters): ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters")
    print(create_organizer(args.email, password))


if __name__ == "__main__":
    main()
