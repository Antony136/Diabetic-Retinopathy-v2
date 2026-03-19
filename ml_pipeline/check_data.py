from __future__ import annotations

import argparse
from pathlib import Path

try:
    import pandas as pd
except ModuleNotFoundError as e:  # pragma: no cover
    raise ModuleNotFoundError(
        "Missing Python dependencies. Install with: pip install -r ml_pipeline/requirements-ml.txt"
    ) from e


def _resolve_image(images_dir: Path, id_code: str) -> Path | None:
    for ext in (".png", ".jpg", ".jpeg"):
        p = images_dir / f"{id_code}{ext}"
        if p.exists():
            return p
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate APTOS2019 train.csv + train_images/ layout and content.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="APTOS dataset directory containing train.csv and train_images/",
    )
    parser.add_argument("--max-missing-report", type=int, default=20, help="Max missing image IDs to print.")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    csv_candidates = [data_dir / "train.csv", data_dir / "train_1.csv"]
    csv_path = next((p for p in csv_candidates if p.exists()), csv_candidates[0])

    images_dir = data_dir / "train_images"
    nested = images_dir / "train_images"
    if images_dir.exists() and not any(images_dir.glob("*.png")) and nested.exists():
        images_dir = nested

    problems: list[str] = []

    if not data_dir.exists():
        problems.append(f"Data dir not found: {data_dir}")
    if not csv_path.exists():
        problems.append(f"Missing CSV: {csv_candidates[0]} (or {csv_candidates[1]})")
    if not images_dir.exists():
        problems.append(f"Missing images directory: {data_dir / 'train_images'}")

    if problems:
        for p in problems:
            print(f"[ERROR] {p}")
        raise SystemExit(2)

    df = pd.read_csv(csv_path)
    required = {"id_code", "diagnosis"}
    missing_cols = required - set(df.columns)
    if missing_cols:
        print(f"[ERROR] train.csv missing required columns: {sorted(missing_cols)}")
        raise SystemExit(2)

    df = df[["id_code", "diagnosis"]].copy()
    df["id_code"] = df["id_code"].astype(str)
    df["diagnosis"] = df["diagnosis"].astype(int, errors="ignore")

    bad_label_rows = df[~df["diagnosis"].isin([0, 1, 2, 3, 4])]
    if len(bad_label_rows) > 0:
        print(f"[ERROR] Found {len(bad_label_rows)} rows with diagnosis خارج [0..4].")
        print(bad_label_rows.head(10).to_string(index=False))
        raise SystemExit(2)

    dupes = df["id_code"].duplicated().sum()
    if dupes:
        print(f"[WARN] Duplicate id_code rows: {dupes}")

    # Check images exist for each id_code.
    missing_images: list[str] = []
    exts_count = {".png": 0, ".jpg": 0, ".jpeg": 0}
    for id_code in df["id_code"].tolist():
        p = _resolve_image(images_dir, id_code)
        if p is None:
            missing_images.append(id_code)
        else:
            exts_count[p.suffix.lower()] = exts_count.get(p.suffix.lower(), 0) + 1

    print("[OK] CSV columns present: id_code, diagnosis")
    print(f"[OK] Rows in train.csv: {len(df)}")
    print("[OK] Label distribution:")
    print(df["diagnosis"].value_counts().sort_index().to_string())
    print(f"[OK] Images dir: {images_dir}")
    print(f"[OK] Found images by extension: {exts_count}")

    # Warn about extra images not referenced by CSV (optional signal).
    image_files = list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.jpeg"))
    print(f"[OK] Total image files in train_images/: {len(image_files)}")

    if missing_images:
        print(f"[ERROR] Missing images for {len(missing_images)} ids (showing up to {args.max_missing_report}):")
        for mid in missing_images[: args.max_missing_report]:
            print(f"  - {mid}")
        raise SystemExit(2)

    print("[OK] All CSV ids have corresponding image files.")


if __name__ == "__main__":
    main()
