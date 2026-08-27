import pandas as pd
import numpy as np
import uuid
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from scipy.sparse import csr_matrix
from pathlib import Path
from qdrant_client import QdrantClient, models
from models import *
from tqdm import tqdm

class DataLoader:
    def __init__(self, dataset_dir: str, database_client_url: str = "http://localhost:6334", vid_dir: str = "vids"):
        # Running setup
        self.dataset_dir = Path(dataset_dir)
        self.database_client = QdrantClient(url=database_client_url, prefer_grpc=True)

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
        self.payload_schema = [ # Only index payloads for filtering
            {
                "field_name": "frame_id",
                "field_schema": models.KeywordIndexParams(
                    type=models.KeywordIndexType.KEYWORD,
                    prefix=True,
                )
            },
            {
                "field_name": "vid_id",
                "field_schema": models.KeywordIndexParams(
                    type=models.KeywordIndexType.KEYWORD,
                    is_tenant=True,
                    prefix=True
                )
            },
            {
                "field_name": "frame_order",
                "field_schema": models.IntegerIndexParams(
                    type=models.IntegerIndexType.INTEGER,
                    is_principal=True,
                    lookup=True,
                    range=False
                ),
            },
            {
                "field_name": "time_order",
                "field_schema": models.FloatIndexParams(
                    type=models.FloatIndexType.FLOAT,
                    is_principal=True,
                )
            },
            {
                "field_name": "transcript",
                "field_schema": models.TextIndexParams(
                    type=models.TextIndexType.TEXT,
                    tokenizer=models.TokenizerType.MULTILINGUAL,
                    min_token_len=2,
                    max_token_len=20,
                    lowercase=True,
                    phrase_matching=True
                )
            }
        ]

        self.map_paths_map = {path.stem: str(path) for path in self.dataset_dir.rglob("maps/**/*.csv")} # Maps
        self.frame_paths_map = {(path.parts[-2], path.stem): str(path) for path in self.dataset_dir.rglob("imgs/**/*.jpg")} # Keyframes
        self.frame_info_map = {}
        self.build_frame_info_map(vid_dir)

        print(f"""Dataset record:
{len(self.map_paths_map)} videos
{len(self.frame_paths_map)} keyframes
""")


    def build_frame_info_map(self, vid_dir: str = "vids"):
        for vid_id, map_path in self.map_paths_map.items():
            vid_path = str(Path(vid_dir) / f"{vid_id}.mp4")
            map = pd.read_csv(map_path).replace({np.nan: None}).to_dict(orient="records")
            for row in map:
                vid_id = row["vid_id"]
                frame_id = f"{row["frame_id"]:03d}"
                frame_path = self.frame_paths_map[(vid_id, frame_id)]
                frame_order = int(row["frame_order"])
                time_order = float(row["time_order"])
                fps = float(row["fps"])
                transcript = row["transcript"]
                base_yt_link = row["base_yt_link"]
                yt_link = base_yt_link + f"&t={time_order}s"

                self.frame_info_map[(vid_id, frame_id)] = {
                    "vid_path": vid_path,
                    "frame_path": frame_path,
                    "vid_id": vid_id,
                    "frame_id": frame_id,
                    "frame_order": frame_order,
                    "time_order": time_order,
                    "fps": fps,
                    "transcript": transcript,
                    "yt_link": yt_link
                }


    def create_new_collection(self, collection_name: str):
        if self.database_client.collection_exists(collection_name=collection_name):
            confirm_deletion = input('The collection already existed, do you want to replace it (y/n)? ')
            if confirm_deletion.lower() == 'y':
                self.database_client.delete_collection(collection_name=collection_name)
                print('Deletion complete.')
            elif confirm_deletion.lower() == 'n':
                print('Deletion cancelled.')
                return False
            else:
                print('Invalid input')
                return False

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
        for schema in self.payload_schema:
            self.database_client.create_payload_index(
                collection_name,
                **schema
            )

        return True


    def list_collections(self):
        names = self.database_client.get_collections()
        print("Currently available collections:")
        for name in names: print(name)


    def delete_collection(self, collection_name):
        self.database_client.delete_collection(collection_name)


    def points_generator(self):
        for frame_path in self.frame_paths_map.values():
            vid_id = Path(frame_path).parts[-2]
            frame_id = Path(frame_path).stem
            feats_path = self.dataset_dir / "feats" / vid_id / f"{frame_id}.npz"
            feats = np.load(feats_path)

            # Point format
            yield models.PointStruct(
                id=str(uuid.uuid4()),
                vector={
                    "siglip2_dense": feats["feat_siglip2_dense"].tolist(),
                    "beit3_dense": feats["feat_beit3_dense"].tolist(),
                    "bgem3_dense": feats["feat_bgem3_dense"].tolist(),
                    "bgem3_sparse": models.SparseVector(
                        indices=feats["feat_bgem3_sparse_token_ids"].tolist(),
                        values=feats["feat_bgem3_sparse_weights"].tolist()
                    )
                },
                payload=self.frame_info_map[(vid_id, frame_id)]
            )


    def upsert_to_db(self, collection_name: str, batch_size: int = 256, num_workers: int = 1):
        self.database_client.upload_points(
            collection_name=collection_name,
            points=tqdm(self.points_generator(), total=len(self.frame_paths_map), desc="Uploading dataset to Qdrant"),
            batch_size=batch_size,
            parallel=num_workers,
        )


    def create_and_fill_database(
        self,
        collection_name: str,
        upload_batch_size: int = 256,
        upload_num_workers: int = 1
    ):
        created = self.create_new_collection(collection_name)
        if created: self.upsert_to_db(
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
        self.database_client = QdrantClient(url=database_client_url, prefer_grpc=True)
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


    def list_collections(self):
        collections = self.database_client.get_collections().collections
        print("Currently available collections:")
        return [collection.name for collection in collections]


    def describe_schema(self, collection_name: str):
        indexed_fields = list(self.database_client.get_collection(collection_name).payload_schema.keys())
        example_point, _ = self.database_client.scroll(
            collection_name,
            limit=1,
        )
        schema_descriptor = {
            key: {
                "data_type": type(value).__name__,
                "is_indexed": False
            }
            for key, value in example_point[0].payload.items()
        }
        for field in indexed_fields: schema_descriptor[field]["is_indexed"] = True
        return schema_descriptor


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


    def cosine_similarity(self, A: list[list[float]], B: list[list[float]]):
        A = np.array(A)
        B = np.array(B)
        return np.dot(A, B.T)


    def sparse_similarity(self, A_ids: list[list[int]], A_w: list[list[float]], B_ids: list[list[int]], B_w: list[list[float]]):
        if not A_ids or not B_ids: return np.array((len(B_ids), len(A_ids)))
        num_feats = max(
            max((max(ids) if ids else 0 for ids in A_ids), default=0),
            max((max(ids) if ids else 0 for ids in B_ids), default=0)
        ) + 1

        def to_csr(token_ids_batch, weights_batch):
            flat_token_ids = np.concat([np.array(x) for x in token_ids_batch])
            flat_weights = np.concat([np.array(x) for x in weights_batch])
            indptr = np.zeros(len(token_ids_batch) + 1, dtype=np.int32)
            np.cumsum([len(x) for x in token_ids_batch], out=indptr[1:])
            return csr_matrix((flat_weights, flat_token_ids, indptr), shape=(len(token_ids_batch), num_feats))

        A = to_csr(A_ids, A_w)
        B = to_csr(B_ids, B_w)
        return (A * B.T).toarray()


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


    def create_filter(self, key: str, value):
        if isinstance(value, (tuple, list)):
            return models.FieldCondition(
                key=key,
                range=models.Range(gte=value[0], lte=value[1])
            )
        return models.FieldCondition(
            key=key,
            match=models.MatchValue(value=value)
        )


    def create_filters(self, **kwargs):
        return [self.create_filter(key, value) for key, value in kwargs.items() if value]


    def get_points(
        self,
        collection_name: str,
        filters: list[models.Condition] = [],
        pagination_limit: int = 1000,
        with_payload: bool | list[str] = True,
        with_vectors: bool | list[str] = False
    ):
        offset = None
        points = []

        while True:
            records, offset = self.database_client.scroll(
                collection_name,
                scroll_filter=models.Filter(must=filters),
                offset=offset,
                limit=pagination_limit,
                with_payload=with_payload,
                with_vectors=with_vectors
            )
            points.extend(records)
            
            if offset is None:
                break

        return points


    def search(
        self,
        collection_name: str,
        prefetch: list[models.Prefetch] | None = None,
        query=None,
        search_limit: int = 100,
        using_vectors: list[str] | str = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
        return_vectors: list[str] | bool = False,
        return_payloads: list[str] | bool = True,
        filter: list[models.Condition] = []
    ):
        if isinstance(query, str): query = self.encode_query(query, return_vectors=using_vectors)
        if isinstance(query, dict):
            if len(using_vectors) == 1:
                prefetch = None
                query = list(query.values())[0]
            else:
                prefetch = self.create_prefetch(**query, search_limit=search_limit)
                query = models.FusionQuery(fusion=models.Fusion.RRF) # defaults to RRF

        points = self.database_client.query_points(
            collection_name,
            prefetch=prefetch,
            query=query,
            using=using_vectors if isinstance(using_vectors, str) else None,
            with_vectors=return_vectors,
            with_payload=return_payloads,
            query_filter=models.Filter(must=filter),
            limit=search_limit,
            search_params=self.search_params
        ).points
        return points


    def batch_search(
        self,
        collection_name: str,
        prefetches: list[list[models.Prefetch]] | None = None,
        queries=None,
        search_limit: int = 100,
        using_vectors: list[str] = ["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
        return_vectors: list[str] | bool = False,
        return_payloads: list[str] | bool = True,
        filter: list[models.Condition] = []
    ):
        if not using_vectors:
            raise ValueError("Cannot search without vector")

        requests = []
        if not prefetches: prefetches = [None] * len(queries)
        for query, prefetch in zip(queries, prefetches):
            if not isinstance(query, models.QueryRequest):
                if isinstance(query, str): query = self.encode_query(query, return_vectors=using_vectors)
                if isinstance(query, dict):
                    if len(using_vectors) == 1:
                        prefetch = None
                        query = list(query.values())[0]
                    else:
                        prefetch = self.create_prefetch(**query, search_limit=search_limit)
                        query = models.FusionQuery(fusion=models.Fusion.RRF) # defaults to RRF

                query = models.QueryRequest(
                    prefetch=prefetch,
                    query=query,
                    using=using_vectors if isinstance(using_vectors, str) else None,
                    filter=models.Filter(must=filter),
                    params=self.search_params,
                    limit=search_limit,
                    with_vector=return_vectors,
                    with_payload=return_payloads,
                )
            requests.append(query)

        results = self.database_client.query_batch_points(
            collection_name,
            requests=requests,
        )
        points = [res.points for res in results]
        return points


    def aggregated_search(
        self,
        collection_name: str,
        query: str,
        search_limit: int = 100,
        aggregation_neighbor_limit: int = 10,
        aggregation_weight: float = 0.5,
        temporal_evaluation_weights: list[float] = [0.6, 0.2, 0.2],
        eps: float = 1e-8
    ):
        # Safeguard
        aggregation_neighbor_limit = np.clip(aggregation_neighbor_limit, 0, search_limit)
        aggregation_weight = np.clip(aggregation_weight, 0, 1)

        # Initial list
        feat_query = self.encode_query(query)
        query_prefetch = self.create_prefetch(
            siglip2_dense=feat_query["siglip2_dense"],
            bgem3_dense=feat_query["bgem3_dense"],
            bgem3_sparse=feat_query["bgem3_sparse"],
            search_limit=search_limit
        )
        points = self.search(
            collection_name,
            prefetch=query_prefetch,
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            search_limit=search_limit,
            return_vectors=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
            return_payloads=True
        )

        # Batch ANN search
        batch_requests = []
        for point in points:
            vid_id = point.payload["vid_id"]
            prefetch = self.create_prefetch(
                siglip2_dense=point.vector["siglip2_dense"],
                search_limit=aggregation_neighbor_limit+1
            )
            batch_requests.append(models.QueryRequest(
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                filter=models.Filter(must=self.create_filters(vid_id=vid_id)),
                params=self.search_params,
                limit=aggregation_neighbor_limit+1,
                with_vector=["siglip2_dense", "beit3_dense", "bgem3_dense", "bgem3_sparse"],
                with_payload=["time_order"],
            ))
        points_neighbors = self.batch_search(collection_name, queries=batch_requests)
        points_neighbors = [neighbors[1:] for neighbors in points_neighbors]
            
        for point, neighbors in zip(points, points_neighbors):
            if not neighbors: continue
            point_time_order = float(point.payload["time_order"])
            neighbor_time_orders = [float(neighbor.payload["time_order"]) for neighbor in neighbors]
            delta = max((max(neighbor_time_orders) - min(neighbor_time_orders)) / len(neighbors), eps)

            total_visual_score = 1
            total_temporal_score = 0
            for neighbor in neighbors:
                # Visual relevance score
                total_visual_score += self.cosine_similarity(point.vector["beit3_dense"], neighbor.vector["beit3_dense"])

                # Temporal relevance score
                neighbor_time_order = float(neighbor.payload["time_order"])
                siglip2_dense_score = self.cosine_similarity([feat_query["siglip2_dense"]], [neighbor.vector["siglip2_dense"]]).item()
                bgem3_dense_score = self.cosine_similarity([feat_query["bgem3_dense"]], [neighbor.vector["bgem3_dense"]]).item()
                bgem3_sparse_score = self.sparse_similarity(
                    [feat_query["bgem3_sparse"].indices],
                    [feat_query["bgem3_sparse"].values],
                    [neighbor.vector["bgem3_sparse"].indices],
                    [neighbor.vector["bgem3_sparse"].values]
                ).item()
                query_neighbor_score = (temporal_evaluation_weights[0] * siglip2_dense_score +
                                        temporal_evaluation_weights[1] * bgem3_dense_score +
                                        temporal_evaluation_weights[2] * bgem3_sparse_score)
                temporal_decay = np.exp(-((point_time_order - neighbor_time_order) ** 2) / (2 * delta ** 2))
                total_temporal_score += query_neighbor_score * temporal_decay

            aggregation_score = (np.log(total_visual_score) / len(neighbors)) * total_temporal_score
            point.score = float((1 - aggregation_weight) * point.score + aggregation_weight * aggregation_score)

        return sorted(points, key=lambda x: x.score, reverse=True)


    def aggregated_search_v2(
        self,
        collection_name: str,
        query: str,
        search_limit: int = 100,

        # ANN method variables
        aggregation_weight: float = 0.5,
        aggregation_neighbor_limit: int = 10,

        # Time radius method variables
        use_time_distance: bool = False,
        time_distance_threshold: float = 60,
        num_workers: int = 16,

        # Visual bonus method variable
        entropy_based_bonus: bool = False,

        # Aggregation normalization method variable
        agg_z_score_sigmoid_norm: bool = False,

        temporal_evaluation_weights: list[float] = [0.6, 0.2, 0.2],
        eps: float = 1e-8,
        logging=False,
    ):
        def _log(point, neighbors, bonus, decays):
            import pandas as pd
            point_time = float(point.payload["time_order"])
            
            records = []
            for neighbor, b, d in zip(neighbors, bonus, decays):
                t_n = float(neighbor.payload["time_order"])
                records.append({
                    "Time (s)": t_n,
                    "Distance (s)": abs(t_n - point_time),
                    "Decay": d,
                    "Before": b,
                    "After": b * d
                })
            
            df = pd.DataFrame(records).sort_values(by="Time (s)").reset_index(drop=True).round(3)
            print('=' * 30)
            print(f"{point.payload['vid_id']}_{point.payload['frame_id']}: t_p = {point_time:.3f}s || init_score = {point.score:.3f}")
            print("Temporal bonus score before and after decay:")
            print(df.to_string())


        # Initial list
        feat_query = self.encode_query(query)
        query_prefetch = self.create_prefetch(
            siglip2_dense=feat_query["siglip2_dense"],
            bgem3_dense=feat_query["bgem3_dense"],
            bgem3_sparse=feat_query["bgem3_sparse"],
            search_limit=search_limit
        )
        points = self.search(
            collection_name,
            prefetch=query_prefetch,
            query=models.FusionQuery(fusion=models.Fusion.DBSF),
            search_limit=search_limit,
            return_vectors=["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
            return_payloads=True
        )

        # Batch ANN search
        if use_time_distance:
            pre_filter = [self.create_filters(
                vid_id=point.payload["vid_id"],
                time_order=(
                    float(point.payload["time_order"]) - time_distance_threshold,
                    float(point.payload["time_order"]) + time_distance_threshold
                )
            ) for point in points]
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                points_neighbors = list(executor.map(
                    lambda f: self.get_points(
                        collection_name,
                        filters=f,
                        with_vectors=["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
                        with_payload=["time_order"],
                    ),
                    pre_filter
                ))
        else:
            batch_requests = [models.QueryRequest(
                query=point.vector["siglip2_dense"],
                using="siglip2_dense",
                filter=models.Filter(must=self.create_filters(vid_id=point.payload["vid_id"])),
                params=self.search_params,
                limit=aggregation_neighbor_limit+1,
                with_vector=["siglip2_dense", "bgem3_dense", "bgem3_sparse"],
                with_payload=["time_order"],
            ) for point in points]
            points_neighbors = self.batch_search(collection_name, queries=batch_requests)

        # Compute aggregation score
        neighbor_counts = []
        temporal_coherence_scores = []
        visual_coherence_scores = []
        for point, neighbors in zip(points, points_neighbors):
            neighbors = [neighbor for neighbor in neighbors if neighbor.id != point.id]
            if not neighbors:
                temporal_coherence_scores.append(0.0)
                visual_coherence_scores.append(0.0)
                neighbor_counts.append(1)
                continue

            point_time_order = float(point.payload["time_order"])
            neighbor_time_orders = np.array([float(neighbor.payload["time_order"]) for neighbor in neighbors])
            if use_time_distance:
                delta = max(np.quantile(np.abs(neighbor_time_orders - point_time_order), 0.25), eps) # nth-quantile abs error
            else:
                delta = 1.334 * np.median(np.abs(neighbor_time_orders - np.median(neighbor_time_orders))) * aggregation_neighbor_limit ** (-0.2)

            temporal_decays = []
            neighbor_feats_siglip2_dense = []
            neighbor_feats_bgem3_dense = []
            neighbor_feats_bgem3_sparse_token_ids = []
            neighbor_feats_bgem3_sparse_weights = []
            for neighbor in neighbors:
                neighbor_time_order = float(neighbor.payload["time_order"])
                temporal_decays.append(np.exp(-((point_time_order - neighbor_time_order) ** 2) / (2 * delta ** 2))) # Radial basis func
                neighbor_feats_siglip2_dense.append(neighbor.vector["siglip2_dense"])
                neighbor_feats_bgem3_dense.append(neighbor.vector["bgem3_dense"])
                neighbor_feats_bgem3_sparse_token_ids.append(neighbor.vector["bgem3_sparse"].indices)
                neighbor_feats_bgem3_sparse_weights.append(neighbor.vector["bgem3_sparse"].values)

            query_sim_siglip2_dense = self.cosine_similarity(neighbor_feats_siglip2_dense, [feat_query["siglip2_dense"]]).flatten()
            cand_sim_siglip2_dense = self.cosine_similarity(neighbor_feats_siglip2_dense, [point.vector["siglip2_dense"]]).flatten()
            sim_bgem3_dense = self.cosine_similarity(neighbor_feats_bgem3_dense, [feat_query["bgem3_dense"]]).flatten()
            sim_bgem3_sparse = self.sparse_similarity(
                neighbor_feats_bgem3_sparse_token_ids,
                neighbor_feats_bgem3_sparse_weights,
                [feat_query["bgem3_sparse"].indices],
                [feat_query["bgem3_sparse"].values]
            ).flatten()
            temporal_bonuses = (
                temporal_evaluation_weights[0] * query_sim_siglip2_dense +
                temporal_evaluation_weights[1] * sim_bgem3_dense +
                temporal_evaluation_weights[2] * sim_bgem3_sparse
            )
            neighbor_counts.append(len(neighbors))
            temporal_coherence_scores.append(np.dot(temporal_bonuses, np.array(temporal_decays).T))

            if entropy_based_bonus:
                exp_score = np.sum(cand_sim_siglip2_dense - np.max(cand_sim_siglip2_dense))
                softmax_score = max(exp_score / np.sum(exp_score), eps)
                visual_coherence_scores.append(1 - (-np.sum(softmax_score * np.log(softmax_score)) / np.log(len(neighbors)))) # Information gain based on Shannon entropy
            else:
                visual_coherence_scores.append(np.log(1 + np.sum(cand_sim_siglip2_dense))) # Normal similarity log-sum

            if logging: _log(point, neighbors, temporal_bonuses, temporal_decays)
        if entropy_based_bonus: visual_coherence_scores = np.linalg.norm(visual_coherence_scores)
        
        # Rerank based on aggregated scores
        init_scores = np.array([point.score for point in points])
        agg_scores = (1 / np.array(neighbor_counts)) * np.array(temporal_coherence_scores) * np.array(visual_coherence_scores)
        init_scores = (init_scores - init_scores.min()) / max((init_scores.max() - init_scores.min()), eps)
        if agg_z_score_sigmoid_norm:
            agg_scores = (agg_scores / np.mean(agg_scores)) / np.std(agg_scores) # Z-score norm
            agg_scores = 1 / (1 + np.exp(-agg_scores)) # Sigmoid norm
        else:
            agg_scores = (agg_scores - agg_scores.min()) / max((agg_scores.max() - agg_scores.min()), eps) # Conventional min-max norm
        final_scores = (1 - aggregation_weight) * init_scores + aggregation_weight * agg_scores
        for point, final_score in zip(points, final_scores): point.score = float(final_score)
        return sorted(points, key=lambda x: x.score, reverse=True)