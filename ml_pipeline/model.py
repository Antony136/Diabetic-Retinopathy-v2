from __future__ import annotations

from typing import Tuple

import timm
import torch
from torch import nn


def build_efficientnet_b3(num_classes: int = 5, pretrained: bool = True) -> nn.Module:
    """
    EfficientNet-B3 classifier.

    Uses timm's ImageNet-pretrained weights (when `pretrained=True`) and replaces
    the classifier head for multi-class DR severity prediction (5 classes).
    """
    model = timm.create_model(
        "efficientnet_b3",
        pretrained=pretrained,
        num_classes=num_classes,
        in_chans=3,
    )
    return model


def split_trainable_params(model: nn.Module) -> Tuple[list[nn.Parameter], list[nn.Parameter]]:
    """
    Returns (backbone_params, head_params) where head is model's classifier.
    """
    head = getattr(model, "classifier", None)
    if head is None:
        raise AttributeError("Expected EfficientNet model to have attribute 'classifier'.")

    head_param_ids = {id(p) for p in head.parameters()}
    backbone_params: list[nn.Parameter] = []
    head_params: list[nn.Parameter] = []
    for p in model.parameters():
        if id(p) in head_param_ids:
            head_params.append(p)
        else:
            backbone_params.append(p)
    return backbone_params, head_params


def set_backbone_trainable(model: nn.Module, trainable: bool) -> None:
    backbone_params, _ = split_trainable_params(model)
    for p in backbone_params:
        p.requires_grad = trainable


def set_head_trainable(model: nn.Module, trainable: bool) -> None:
    _, head_params = split_trainable_params(model)
    for p in head_params:
        p.requires_grad = trainable

