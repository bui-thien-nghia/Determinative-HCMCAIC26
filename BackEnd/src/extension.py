import torch
from torch import nn

class StyleEncoder(nn.Module):
    def __init__(self, token_dim: int = 1024, style_dim: int = 128, n_gram: int = 3):
        super().__init__()
        self.ngram_conv = nn.Sequential(
            nn.Conv1d(token_dim, 256, kernel_size=n_gram, padding=1),
            nn.BatchNorm1d(style_dim * 2),
            nn.GELU(),
            nn.Conv1d(256, 128, kernel_size=n_gram, padding=1),
            nn.BatchNorm1d(128),
            nn.GELU()
        )

        self.proj = nn.Sequential(
            nn.Linear(128, style_dim),
            nn.LayerNorm(style_dim)
        )


    def forward(self, multi_vectors: torch.Tensor):
        x = multi_vectors.transpose(1, 2)
        conved = self.ngram_conv(x)
        pooled = conved.mean(dim=-1)
        p_style = self.proj(pooled)

        return p_style


class StyleHypernetwork(nn.Module):
    def __init__(self, style_dim: int = 128, query_dim: int = 1024, hidden_dim: int = 128):
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(style_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, query_dim * 2)
        )


    def forward(self):
        pass


class QueryModulator(nn.Module):
    def __init__(self):
        super().__init__()


    def forward(self):
        pass


class TextGenerator:
    pass