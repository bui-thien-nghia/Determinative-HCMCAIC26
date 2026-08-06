import json
import pandas as pd
import numpy as np
import uuid
from pathlib import Path
from tqdm import tqdm
from qdrant_client import QdrantClient, models
from models import *

class DataLoader:
    def __init__(self, dataset_dir: str, database_client_url="http://localhost:6333"):
        # Running setup
        self.dataset_dir = Path(dataset_dir)
        self.database_client = QdrantClient(url=database_client_url)

        # Schema
        self.feat_siglip2_dense_params = models.VectorParams(
            size=1152,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_beit3_dense_params = models.VectorParams(
            size=1024,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_bgem3_dense_params = models.VectorParams(
            size=1024,
            distance=models.Distance.COSINE,
            on_disk=True
        )
        self.feat_bgem3_sparse_params = models.SparseVectorParams(
            index=models.SparseIndexParams(on_disk=True),
            modifier=models.Modifier.IDF
        )
        self.db_hnsw_params = models.HnswConfigDiff(
            m=32,
            ef_construct=200,
            full_scan_threshold=10000
        )
        self.db_quantization_params = models.ScalarQuantization(
            scalar=models.ScalarQuantizationConfig(
                type=models.ScalarType.INT8,
                quantile=1.0,
                always_ram=True
            )
        )

        self.vid_paths_map = {path.stem: str(path) for path in self.dataset_dir.rglob("vids/**/*.mp4")} # Videos
        self.img_paths = [str(path) for path in self.dataset_dir.rglob("imgs/**/*.jpg")] # Keyframes

        print(f"""Dataset record:
{len(self.vid_paths_map)} videos
{len(self.img_paths)} keyframes
""")


    def create_new_collection(self, collection_name: str):
        if self.database_client.collection_exists(collection_name=collection_name):
            confirm_deletion = input('The collection already existed, do you want to replace it (y/n)? ')
            if confirm_deletion.lower() == 'y':
                self.database_client.delete_collection(collection_name=collection_name)
                print('Deletion complete.')
            elif confirm_deletion.lower() == 'n':
                print('Deletion cancelled.')
                return
            else:
                print('Invalid input')
                return

        self.database_client.create_collection(
            collection_name=collection_name,
            vectors_config={
                'siglip2_dense': self.feat_siglip2_dense_params,
                'beit3_dense': self.feat_beit3_dense_params,
                'bgem3_dense': self.feat_bgem3_dense_params,
            },
            sparse_vectors_config={'bgem3_sparse': self.feat_bgem3_sparse_params},
            hnsw_config=self.db_hnsw_params,
            quantization_config=self.db_quantization_params
        )


    def list_collections(self):
        names = self.database_client.get_collections()
        print("Currently available collections:")
        for name in names: print(name)


    def delete_collection(self, collection_name):
        self.database_client.delete_collection(collection_name)
    

    def form_points(self, indices):
        points = []
        if indices == []: indices = range(len(self.img_paths))

        for i in indices:
            frame_path = self.img_paths[i]
            vid_id = Path(frame_path).parts[-2]
            frame_id = Path(frame_path).stem
            vid_path = self.vid_paths_map[vid_id]

            met_path = self.dataset_dir / "mets" / f"{vid_id}.json"
            map_path = self.dataset_dir / "maps" / f"{vid_id}.csv"
            tran_path = self.dataset_dir / "trans" / vid_id / f"{frame_id}.txt"
            feat_siglip2_dense_path = self.dataset_dir / "feats" / "siglip2_dense" / vid_id / f"{frame_id}.npy"
            feat_beit3_dense_path = self.dataset_dir / "feats" / "beit3_dense" / vid_id / f"{frame_id}.npy"
            feat_bgem3_dense_path = self.dataset_dir / "feats" / "bgem3_dense" / vid_id / f"{frame_id}.npy"
            feat_bgem3_sparse_token_ids_path = self.dataset_dir / "feats" / "bgem3_sparse" / "token_ids" / vid_id / f"{frame_id}.npy"
            feat_bgem3_sparse_weights_path = self.dataset_dir / "feats" / "bgem3_sparse" / "weights" / vid_id / f"{frame_id}.npy"

            # Fetch unloaded data
            img_map = pd.read_csv(map_path, skiprows=range(1, int(frame_id)), nrows=1).iloc[0].tolist()
            try:
                frame_order, time_order, fps = img_map
            except Exception:
                frame_order, time_order, fps = img_map[1:]
            with open(tran_path, 'r', encoding="utf-8") as f:
                tran = f.read()
            with open(met_path, 'r', encoding='utf-8') as f:
                met = json.load(f)
                yt_link = met["watch_url"] + f"&t={time_order}s"
            feat_siglip2_dense = np.load(feat_siglip2_dense_path).tolist()
            feat_beit3_dense = np.load(feat_beit3_dense_path).tolist()
            feat_bgem3_dense = np.load(feat_bgem3_dense_path).tolist()
            feat_bgem3_sparse_token_ids = np.load(feat_bgem3_sparse_token_ids_path).tolist()
            feat_bgem3_sparse_weights = np.load(feat_bgem3_sparse_weights_path).tolist()

            # Point format
            point = models.PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "siglip2_dense": feat_siglip2_dense,
                    "beit3_dense": feat_beit3_dense,
                    "bgem3_dense": feat_bgem3_dense,
                    "bgem3_sparse": models.SparseVector(
                        indices=feat_bgem3_sparse_token_ids,
                        values=feat_bgem3_sparse_weights
                    )
                },
                payload={
                    "frame_path": frame_path,
                    "vid_path": vid_path,
                    "frame_id": frame_id,
                    "vid_id": vid_id,
                    "frame_order": frame_order,
                    "time_order": time_order,
                    "fps": fps,
                    "yt_link": yt_link,
                    "transcript": tran
                }
            )
            points.append(point)

        return points


    def upsert_to_db(self, collection_name: str, batch_size: int = 256, num_workers: int = 1):
        points_count = len(self.img_paths)
        for i in tqdm(range(0, points_count, batch_size)):
            j = i + batch_size if i + batch_size < points_count else points_count
            points = self.form_points(range(i, j))
            self.database_client.upload_points(
                collection_name=collection_name,
                points=points,
                batch_size=256,
                parallel=num_workers,
            )


    def create_and_fill_database(
        self,
        collection_name: str,
        upload_batch_size: int = 256,
        upload_num_workers: int = 1
    ):
        self.create_new_collection(collection_name)
        self.upsert_to_db(
            collection_name,
            batch_size=upload_batch_size,
            num_workers=upload_num_workers
        )


class QueryManager:
    def __init__(
        self,
        image_text_feature_extractor: ExtractionModel,
        text_text_feature_extractor: ExtractionModel,
        database_client_url="http://localhost:6333"
    ):
        # Running setup
        self.database_client = QdrantClient(url=database_client_url)
        self.image_text_feature_extractor = image_text_feature_extractor
        self.text_text_feature_extractor = text_text_feature_extractor

        self.search_params = models.SearchParams(
            hnsw_ef=200,
            quantization=models.QuantizationSearchParams(
                rescore=True,
                oversampling=2.0
            )
        )

        self.image_text_feature_extractor.load()
        self.text_text_feature_extractor.load()


    def encode_query(self, query: str, return_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"]):
        feat_query: dict[str, list | models.SparseVector | None] = {vect: None for vect in return_vectors}
        if "siglip2_dense" in return_vectors: feat_query["siglip2_dense"] = self.image_text_feature_extractor.run([query], 1).flatten().tolist()
        if "bgem3_dense" in return_vectors or "bgem3_sparse" in return_vectors:
            feat_bgem3_dense, feat_bgem3_sparse, _ = self.text_text_feature_extractor.run([query], 1)
            if "bgem3_dense" in return_vectors: feat_query["bgem3_dense"] = feat_bgem3_dense[0].flatten().tolist()
            if "bgem3_sparse" in return_vectors: feat_query["bgem3_sparse"] = models.SparseVector(
                indices=np.array(list(feat_bgem3_sparse[0].keys()), dtype=np.int32).tolist(),
                values=np.array(list(feat_bgem3_sparse[0].values()), dtype=np.float32).tolist(),
            )

        return feat_query


    def cosine_similarity(self, vect_a: list, vect_b: list):
        np_vect_a = np.array(vect_a)
        np_vect_b = np.array(vect_b)
        return float(np.dot(np_vect_a, np_vect_b)) # Variant for all vectors normalized


    def sparse_similarity(self, ids_a: list, weights_a: list, ids_b: list, weights_b: list):
        vect_a = {id: weight for id, weight in zip(ids_a, weights_a)}
        vect_b = {id: weight for id, weight in zip(ids_b, weights_b)}
        common_ids = set(vect_a.keys()).intersection(vect_b.keys())
        return float(sum(vect_a[id] * vect_b[id] for id in common_ids))


    def create_prefetch(
        self,
        siglip2_dense = None,
        bgem3_dense = None,
        bgem3_sparse = None,
        search_limit: int = 100
    ):
        prefetch = []
        if siglip2_dense:
            prefetch.append(models.Prefetch(
                query=siglip2_dense,
                using="siglip2_dense",
                limit=search_limit
            ))
        if bgem3_dense:
            prefetch.append(models.Prefetch(
                query=bgem3_dense,
                using="bgem3_dense",
                limit=search_limit
            ))
        if bgem3_sparse:
            prefetch.append(models.Prefetch(
                query=bgem3_sparse,
                using="bgem3_sparse",
                limit=search_limit
            ))
        return prefetch


    def create_filter(self, filter_key: str, filter_value: str):
        return models.FieldCondition(
            key=filter_key,
            match=models.MatchValue(value=filter_value)
        )


    def search(
        self,
        collection_name: str,
        query: str | list[models.Prefetch],
        search_limit: int = 100,
        using_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
        return_vectors: list[str] | bool = False,
        return_payloads: list[str] | bool = True,
        filter: list[models.Condition] = []
    ): # Filter is implemented inside search as well
        if not using_vectors and not filter:
            raise ValueError("Cannot search without vector or filter condition")

        if type(query) == str:
            feat_query = self.encode_query(query, return_vectors=using_vectors)
            prefetch = self.create_prefetch(**feat_query, search_limit=search_limit)
        else:
            prefetch = query

        points = self.database_client.query_points(
            collection_name,
            prefetch=prefetch,
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            with_vectors=return_vectors,
            with_payload=return_payloads,
            query_filter=models.Filter(must=filter),
            limit=search_limit,
            search_params=self.search_params
        ).points
        return points


    def aggregated_search(
        self,
        collection_name: str,
        query: str,
        search_limit: int = 100,
        aggregation_neighbor_limit: int = 10,
        aggregation_weight: float = 0.5,
    ):
        # Safeguard
        aggregation_neighbor_limit = np.clip(aggregation_neighbor_limit, 0, search_limit)
        aggregation_weight = np.clip(aggregation_weight, 0, 1)

        # Initial list
        feat_query = self.encode_query(query)
        points = self.search(
            collection_name,
            query=query,
            search_limit=search_limit,
            return_vectors=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
            return_payloads=True
        )

        for point in points:
            vid_id, time_order = point.payload["vid_id"], float(point.payload["time_order"])

            # ANN implementation
            point_prefetch = self.create_prefetch(
                siglip2_dense=point.vector["siglip2_dense"],
                search_limit=aggregation_neighbor_limit+1
            )
            neighbors = self.search(
                collection_name,
                query=point_prefetch,
                using_vectors=["siglip2_dense"],
                search_limit=search_limit+1,
                return_vectors=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
                return_payloads=["time_order"],
                filter=[self.create_filter("vid_id", vid_id)]
            )[1:]

            if not neighbors: continue
            neighbor_time_orders = [float(neighbor.payload["time_order"]) for neighbor in neighbors]
            delta = (max(neighbor_time_orders) - min(neighbor_time_orders)) / len(neighbors)

            total_visual_score = 1
            total_temporal_score = 0

            for neighbor in neighbors:
                # Visual relevance score
                total_visual_score += self.cosine_similarity(point.vector["beit3_dense"], neighbor.vector["beit3_dense"])

                # Temporal relevance score
                neighbor_time_order = float(neighbor.payload["time_order"])
                siglip2_dense_score = self.cosine_similarity(feat_query["siglip2_dense"], neighbor.vector["siglip2_dense"])
                bgem3_dense_score = self.cosine_similarity(feat_query["bgem3_dense"], neighbor.vector["bgem3_dense"])
                bgem3_sparse_score = self.sparse_similarity(
                    feat_query["bgem3_sparse"].indices,
                    feat_query["bgem3_sparse"].values,
                    neighbor.vector["bgem3_sparse"].indices,
                    neighbor.vector["bgem3_sparse"].values
                )
                query_neighbor_score = (0.4 * siglip2_dense_score +
                                        0.3 * bgem3_dense_score +
                                        0.3 * bgem3_sparse_score)
                temporal_decay = np.exp(-((time_order - neighbor_time_order) ** 2) / (2 * delta ** 2))
                total_temporal_score += query_neighbor_score * temporal_decay

            aggregation_score = (np.log(total_visual_score) / len(neighbors)) * total_temporal_score
            point.score = (1 - aggregation_weight) * point.score + aggregation_weight * aggregation_score

        # Rerank based on aggregated scores
        return sorted(points, key=lambda x: x.score, reverse=True)

class PreferenceConfigurator:
    pass # For future work, after finishing basic database framework