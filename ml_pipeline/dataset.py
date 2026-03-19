from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms


IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


@dataclass(frozen=True)
class AptosPaths:
    csv_path: Path
    images_dir: Path


class APTOS2019Dataset(Dataset):
    """
    APTOS 2019 dataset wrapper.

    Expected CSV columns:
      - id_code: image id (filename without extension)
      - diagnosis: integer label in [0..4]

    Images are typically stored as PNG files in `train_images/`.
    """

    def __init__(self, csv_path: Path, images_dir: Path, transform: Optional[transforms.Compose] = None) -> None:
        self.csv_path = Path(csv_path)
        self.images_dir = Path(images_dir)
        self.transform = transform

        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV not found: {self.csv_path}")
        if not self.images_dir.exists():
            raise FileNotFoundError(f"Images directory not found: {self.images_dir}")

        df = pd.read_csv(self.csv_path)
        required = {"id_code", "diagnosis"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"CSV missing required columns: {sorted(missing)}")

        df = df[["id_code", "diagnosis"]].copy()
        df["id_code"] = df["id_code"].astype(str)
        df["diagnosis"] = df["diagnosis"].astype(int)

        if df["diagnosis"].min() < 0 or df["diagnosis"].max() > 4:
            raise ValueError("Diagnosis labels must be in [0..4].")

        self._df = df.reset_index(drop=True)

    def __len__(self) -> int:
        return len(self._df)

    def _resolve_image_path(self, id_code: str) -> Path:
        candidates = [
            self.images_dir / f"{id_code}.png",
            self.images_dir / f"{id_code}.jpg",
            self.images_dir / f"{id_code}.jpeg",
        ]
        for p in candidates:
            if p.exists():
                return p
        raise FileNotFoundError(f"Image not found for id_code={id_code!r} in {self.images_dir}")

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int]:
        row = self._df.iloc[idx]
        image_path = self._resolve_image_path(row["id_code"])
        label = int(row["diagnosis"])

        image = Image.open(image_path).convert("RGB")
        if self.transform is not None:
            image = self.transform(image)

        return image, label


def build_paths(data_dir: Path) -> AptosPaths:
    data_dir = Path(data_dir)
    csv_candidates = [data_dir / "train.csv", data_dir / "train_1.csv"]
    csv_path = next((p for p in csv_candidates if p.exists()), csv_candidates[0])

    images_dir = data_dir / "train_images"
    # Some exports are nested: train_images/train_images/*.png
    nested = images_dir / "train_images"
    if images_dir.exists() and not any(images_dir.glob("*.png")) and nested.exists():
        images_dir = nested

    return AptosPaths(csv_path=csv_path, images_dir=images_dir)


def get_train_transforms(img_size: int = 300) -> transforms.Compose:
    """
    Strong augmentation: rotation, flips, brightness/contrast, zoom/crop.
    """
    return transforms.Compose(
        [
            transforms.RandomResizedCrop(img_size, scale=(0.75, 1.0), ratio=(0.9, 1.1)),
            transforms.RandomRotation(degrees=25),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.5),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1, hue=0.02),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )


def get_val_transforms(img_size: int = 300) -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
