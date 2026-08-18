from typing import Any

import torch
from torch import nn
from torch.nn import functional as F

class StyleEncoder(nn.Module):
    def __init__(self, multi_vector_dim: int = 1024, style_dim: int = 128, n_gram: int = 3):
        super().__init__()
        self.ngram_conv = nn.Sequential(
            nn.Conv1d(multi_vector_dim, 256, kernel_size=n_gram, padding=1),
            nn.BatchNorm1d(256),
            nn.GELU(),
            nn.Conv1d(256, 128, kernel_size=n_gram, padding=1),
            nn.BatchNorm1d(128),
            nn.GELU()
        )

        self.proj = nn.Sequential(
            nn.Linear(128, style_dim),
            nn.LayerNorm(style_dim)
        )


    def forward(self, multi_vectors: torch.Tensor, attention_mask: torch.Tensor | None = None):
        x = multi_vectors.transpose(1, 2)
        conved = self.ngram_conv(x)
        if attention_mask is not None:
            attention_mask = ~attention_mask.bool()
            mask_expanded = attention_mask.unsqueeze(1).float()
            pooled = (conved * mask_expanded).sum(dim=-1) / torch.clamp(mask_expanded.sum(dim=-1), min=1e-9)
        else:
            pooled = conved.mean(dim=-1)
        p_style = self.proj(pooled)

        return p_style


class StyleEncoderWithAttention(nn.Module):
    def __init__(self, multi_vector_dim: int = 1024, latent_dim: int = 512, num_queries: int = 4):
        super().__init__()
        self.latent_queries = nn.Parameter(torch.randn(1, num_queries, latent_dim))
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=latent_dim,
            num_heads=8,
            kdim=multi_vector_dim,
            vdim=multi_vector_dim,
            batch_first=True
        )
        self.ln_q = nn.LayerNorm(latent_dim)
        self.ln_k = nn.LayerNorm(multi_vector_dim)


    def forward(self, multi_vectors: torch.Tensor, attention_mask: torch.Tensor | None = None):
        batch_size = multi_vectors.size(0)
        queries = self.latent_queries.expand(batch_size, -1, -1)
        queries = self.ln_q(queries)
        keys_values = self.ln_k(multi_vectors)

        if attention_mask is not None: attention_mask = ~attention_mask.bool()

        attn, _ = self.cross_attn(
            query=queries,
            key=keys_values,
            value=keys_values,
            key_padding_mask=attention_mask
        )
        p_style = attn.reshape(batch_size, -1)
        return p_style


class StyleHypernetwork(nn.Module):
    def __init__(self, style_dim: int = 2048, query_dim: int = 1024):
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(style_dim, style_dim // 2),
            nn.LeakyReLU(0.2),
            nn.Linear(style_dim // 2, query_dim * 2)
        )
        nn.init.zeros_(self.mlp[2].weight)
        nn.init.zeros_(self.mlp[2].bias)


    def forward(self, p_style: torch.Tensor):
        params = self.mlp(p_style)
        gamma, beta = torch.chunk(params, 2, dim=-1)
        return gamma + 1.0, beta


class QueryModulator(nn.Module):
    def __init__(self):
        super().__init__()


    def forward(self, query: torch.Tensor, gamma: torch.Tensor, beta: torch.Tensor):
        return F.normalize(gamma * query + beta, dim=-1)


class StyleAdapter(nn.Module):
    def __init__(self, query_dims: dict[str, int], multi_vector_dim: int = 1024, style_dim: int = 128):
        super().__init__()
        self.style_encoder = StyleEncoder(multi_vector_dim=multi_vector_dim, style_dim=style_dim)
        self.style_hypernetworks = nn.ModuleDict({
            type: StyleHypernetwork(query_dim=query_dim, style_dim=style_dim)
            for type, query_dim in query_dims.items()
        })
        self.query_modulator = QueryModulator()


    def forward(
        self,
        queries: dict[str, torch.Tensor],
        multi_vectors: torch.Tensor,
        attention_mask: torch.Tensor | None = None
    ):
        p_style = self.style_encoder(multi_vectors, attention_mask=attention_mask)
        queries_adapted = {type: None for type in queries.keys()}
        for type, hypernetwork in self.style_hypernetworks.items():
            if type not in queries_adapted: continue
            gamma, beta = hypernetwork(p_style)
            queries_adapted[type] = self.query_modulator(queries[type], gamma, beta)

        return queries_adapted


class StyleAdapterWithAttention(nn.Module):
    def __init__(
        self,
        query_dims: dict[str, int],
        multi_vector_dim: int = 1024,
        latent_dim: int = 512,
        num_queries: int = 4,
    ):
        super().__init__()
        self.style_encoder = StyleEncoderWithAttention(multi_vector_dim=multi_vector_dim, latent_dim=latent_dim, num_queries=num_queries)
        self.style_hypernetworks = nn.ModuleDict({
            type: StyleHypernetwork(query_dim=query_dim, style_dim=latent_dim * num_queries)
            for type, query_dim in query_dims.items()
        })
        self.query_modulator = QueryModulator()


    def forward(
        self,
        queries: dict[str, torch.Tensor],
        multi_vectors: torch.Tensor,
        attention_mask: torch.Tensor | None = None
    ):
        p_style = self.style_encoder(multi_vectors, attention_mask=attention_mask)
        queries_adapted = {type: None for type in queries.keys()}
        for type, hypernetwork in self.style_hypernetworks.items():
            if type not in queries_adapted: continue
            gamma, beta = hypernetwork(p_style)
            queries_adapted[type] = self.query_modulator(queries[type], gamma, beta)

        return queries_adapted


class TextGenerator:
    pass


if __name__ == "__main__":
    import time
    device = "cuda" if torch.cuda.is_available() else "cpu"
    batch_size = 10
    seq_len = 30
    query_dims = {
        "siglip2_dense": 1152,
        "bgem3_dense": 1024
    }
    multi_vector_dim = 1024

    dummy_features = {
        "siglip2_dense": torch.randn(batch_size, 1152).to(device),
        "bgem3_dense": torch.randn(batch_size, 1024).to(device)
    }
    dummy_multi_vectors = torch.randn(batch_size, seq_len, 1024).to(device)


    adapter = StyleAdapterWithAttention(
        query_dims=query_dims,
        multi_vector_dim=multi_vector_dim
    ).to(device)

    s = time.time()
    queries_adapted = adapter(dummy_features, dummy_multi_vectors)
    e = time.time()
    print(f"Runtime: {e - s}s")
    for type, vect in queries_adapted.items(): print(f"Shape of {type} dense after adaptation: {vect.shape}")