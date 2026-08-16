from typing import Any
from torch import nn

class StyleHypernetwork(nn.Module):
    def __init__(self, n_dimensions: int, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.modulation_generator = nn.Sequential(
            nn.Linear(n_dimensions, 128),
            nn.ReLU(),
            nn.Linear(128, n_dimensions * 2)
        )


    def forward(self, vector):
        pass


class TextGenerator:
    pass